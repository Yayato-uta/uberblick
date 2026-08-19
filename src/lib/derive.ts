import type { Asset, Data, Goal, Item, ReimbExtra } from "../types";
import { FREQ } from "./constants";
import { avgOf, forecast, sumOf, type MonthRow } from "./forecast";
import { countOccurrences, fromYM, nowIdx, occursIn, shortLabel } from "./month";
import { reimbBetween, reimbEnd, reimbInMonth, reimbSchedule, type ReimbSchedule } from "./reimb";

/* Everything the views read is computed here, in one pass, from the persisted
   data alone. Views stay dumb; the arithmetic stays testable. */

export interface PersonItem extends Item {
  /** the repayment's own schedule, with blank dates filled from the item */
  sched: ReimbSchedule;
  /** total still to come from this person on this item */
  total: number;
  /** scheduled instalments still ahead, lump sums aside */
  paymentsLeft: number;
  /** last month anything is expected back, null when open-ended */
  stop: number | null;
  /** what you pay alone after their repayments stop */
  alone: number;
  aloneMonths: number;
  /** their repayments end but yours never do */
  aloneOngoing: boolean;
  /** lump sums still ahead */
  lumps: ReimbExtra[];
}

export interface Person {
  who: string;
  /** average per month across the horizon, not the per-payment amount */
  monthly: number;
  outstanding: number;
  /** at least one repayment has no end date */
  ongoing: boolean;
  items: PersonItem[];
}

export interface GoalRow extends Goal {
  byIdx: number | null;
  /** never earlier than the current month */
  fromIdx: number;
  /** saving hasn't started yet */
  later: boolean;
  monthsLeft: number | null;
  need: number;
  perMonth: number;
  inPlan: boolean;
  /** the amount of the linked saving item, when there is one */
  planned: number;
}

export interface EndingRow extends Item {
  lastIdx: number;
  monthsLeft: number;
  /** monthly outflow (monthly equivalent for non-monthly items) */
  perMonth: number;
  /** what actually frees up — net of anything somebody sends back */
  net: number;
  /** somebody is still repaying it right up to the final payment */
  stillCovered: boolean;
}

/** An item whose repayment stops before the expense does — your cost goes UP. */
export interface CostRiseRow extends Item {
  who: string;
  /** last month money comes back */
  rEnd: number;
  /** last month you pay, null when the expense is open-ended */
  iEnd: number | null;
  /** months from now until the repayments stop */
  monthsUntil: number;
  /** monthly outflow that lands on you afterwards */
  perMonth: number;
  /** everything you carry alone after that, when the expense has an end */
  total: number;
  /** how many payments that is */
  n: number;
}

export interface AssetPoint {
  idx: number;
  name: string;
  total: number;
  [assetId: string]: number | string;
}

export interface AssetSeries {
  rows: AssetPoint[];
  /** value of each asset at the end of the horizon, in `assets` order */
  ending: number[];
  /** how much was paid in over the horizon, in `assets` order */
  contributed: number[];
}

export interface Derived {
  start: number;
  horizon: number;
  months: MonthRow[];
  last: MonthRow;

  mIncome: number;
  mExpense: number;
  mReimb: number;
  mSaving: number;
  mIrregular: number;
  mInterest: number;
  totalInterest: number;

  /** avg(expense) - avg(reimb) — what it really costs */
  netCost: number;
  /** avg(income) + avg(reimb) - avg(expense) - avg(saving) */
  leftover: number;

  lowest: MonthRow;
  heaviest: MonthRow;

  floor: number;
  headroom: number;
  breach: MonthRow | undefined;
  clearsBy: MonthRow | undefined;
  /** the deepest the account goes, as a positive number */
  worstDrawdown: number;

  people: Person[];
  passThrough: number;

  goalRows: GoalRow[];
  goalsToFund: number;
  goalsLater: number;

  assets: Asset[];
  assetSeries: AssetSeries;
  assetsNow: number;
  assetsEnd: number;
  putIn: number;
  growth: number;
  committed: number;
  netWorthNow: number;
  netWorthEnd: number;

  ending: EndingRow[];
  freedTotal: number;
  costRises: CostRiseRow[];
}

export function derive(data: Data, start: number = nowIdx()): Derived {
  const items = data.items ?? [];
  const goals = data.goals ?? [];
  const assets = data.assets ?? [];
  const horizon = data.horizon || 12;

  const months = forecast({
    items,
    opening: Number(data.opening) || 0,
    odRate: Number(data.odRate) || 0,
    horizon,
    start,
  });
  const last = months[months.length - 1];

  const mIncome = avgOf(months, "income");
  const mExpense = avgOf(months, "expense");
  const mReimb = avgOf(months, "reimb");
  const mSaving = avgOf(months, "saving");
  const mIrregular = avgOf(months, "irregular");
  const mInterest = avgOf(months, "interest");
  const totalInterest = sumOf(months, "interest");

  const netCost = mExpense - mReimb;
  const leftover = mIncome + mReimb - mExpense - mSaving;

  const lowest = months.reduce((a, b) => (b.balance < a.balance ? b : a), months[0]);
  const heaviest = months.reduce((a, b) => (b.expense > a.expense ? b : a), months[0]);

  const floor = -Math.abs(Number(data.overdraft) || 0);
  const headroom = lowest.balance - floor;
  const breach = months.find((m) => m.balance < floor);
  const clearsBy = months.find((m) => m.balance >= 0);
  const worstDrawdown = Math.max(0, -lowest.balance);

  /* ── who pays me back ──
     Everything here runs off the repayment's own schedule, never the expense's:
     the two can start and stop in different months, and lump sums land outside
     both. */
  const map = new Map<string, Person>();
  for (const it of items) {
    if (it.kind !== "expense" || !it.reimb) continue;
    const sched = reimbSchedule(it)!;
    const who = sched.who;
    let p = map.get(who);
    if (!p) {
      p = { who, monthly: 0, outstanding: 0, ongoing: false, items: [] };
      map.set(who, p);
    }

    const stop = reimbEnd(it);
    const iEnd = fromYM(it.last);

    // everything still to come back
    let total = 0;
    if (stop === null) p.ongoing = true;
    else total = reimbBetween(it, start, stop);

    // what you carry alone once their repayments stop
    let alone = 0;
    let aloneMonths = 0;
    if (stop !== null && iEnd !== null && iEnd > stop) {
      for (let i = stop + 1; i <= iEnd; i++) {
        if (occursIn(it, i)) {
          alone += it.amount;
          aloneMonths++;
        }
      }
    }
    const aloneOngoing = stop !== null && iEnd === null;

    let overHorizon = 0;
    for (const m of months) overHorizon += reimbInMonth(it, m.idx);

    p.monthly += months.length ? overHorizon / months.length : 0;
    p.outstanding += total;
    p.items.push({
      ...it,
      sched,
      total,
      paymentsLeft: stop === null ? 0 : countOccurrences(sched, start, stop),
      stop,
      alone,
      aloneMonths,
      aloneOngoing,
      lumps: sched.extras.filter((e) => {
        const i = fromYM(e.month);
        return i !== null && i >= start;
      }),
    });
  }
  const people = [...map.values()].sort((a, b) => b.monthly - a.monthly);
  const passThrough = people.reduce((s, p) => s + p.monthly, 0);

  /* ── goals with a deadline ── */
  const goalRows: GoalRow[] = goals
    .map((g) => {
      const byIdx = fromYM(g.by);
      const fromIdx = Math.max(fromYM(g.from) ?? start, start);
      const later = fromIdx > start;
      const monthsLeft = byIdx === null ? null : Math.max(1, byIdx - fromIdx + 1);
      const need = Math.max(0, (Number(g.target) || 0) - (Number(g.saved) || 0));
      const linked = g.itemId ? items.find((i) => i.id === g.itemId) : undefined;
      return {
        ...g,
        byIdx,
        fromIdx,
        later,
        monthsLeft,
        need,
        perMonth: monthsLeft ? need / monthsLeft : need,
        inPlan: !!linked,
        planned: linked ? linked.amount : 0,
      };
    })
    .sort((a, b) => a.fromIdx - b.fromIdx);

  const goalsToFund = goalRows
    .filter((g) => !g.inPlan && !g.later)
    .reduce((s, g) => s + g.perMonth, 0);
  const goalsLater = goalRows.filter((g) => !g.inPlan && g.later).reduce((s, g) => s + g.perMonth, 0);

  /* ── what you own, projected forward ── */
  const assetSeries = projectAssets(assets, items, horizon, start);

  const assetsNow = assets.reduce((s, a) => s + (Number(a.value) || 0), 0);
  const assetsEnd = assetSeries.ending.reduce((s, v) => s + v, 0);
  const putIn = assetSeries.contributed.reduce((s, v) => s + v, 0);
  const growth = assetsEnd - assetsNow - putIn;

  /* what you're still committed to pay, net of what people send back */
  const committed = items.reduce((s, it) => {
    if (it.kind !== "expense" || !it.last) return s;
    const lastIdx = fromYM(it.last);
    if (lastIdx === null || lastIdx < start) return s;
    let t = 0;
    for (let i = start; i <= lastIdx; i++) if (occursIn(it, i)) t += it.amount;
    // repayments can outlast the expense, so net them off over the longer span
    const until = Math.max(lastIdx, reimbEnd(it) ?? lastIdx);
    t -= reimbBetween(it, start, until);
    return s + Math.max(0, t);
  }, 0);

  const netWorthNow = assetsNow + (Number(data.opening) || 0) - committed;
  const netWorthEnd = assetsEnd + (last ? last.balance : 0) - committed;

  /* ── things that end ── */
  const ending: EndingRow[] = items
    .flatMap((it) => {
      if (!it.last || it.kind === "income") return [];
      const lastIdx = fromYM(it.last);
      if (lastIdx === null || lastIdx < start) return [];
      const perMonth =
        it.freq === "monthly" ? it.amount : it.amount * (FREQ[it.freq].per_year / 12);
      /* Only a repayment that runs to the very last payment keeps money from
         freeing up. One that stops earlier has already handed you the full
         amount — that case belongs to "cost goes up", and what frees up here
         is the whole payment. */
      const sched = reimbSchedule(it);
      const rEnd = reimbEnd(it);
      const stillCovered = !!sched && (rEnd === null || rEnd >= lastIdx);
      const back = stillCovered ? sched!.amount * (FREQ[sched!.freq].per_year / 12) : 0;
      return [
        {
          ...it,
          lastIdx,
          monthsLeft: lastIdx - start + 1,
          perMonth,
          net: perMonth - back,
          stillCovered,
        },
      ];
    })
    .sort((a, b) => a.lastIdx - b.lastIdx);

  const freedTotal = ending.reduce((s, i) => s + Math.max(0, i.net), 0);

  /* ── repayments that stop before the expense does ──
     The unpleasant surprise: the direct debit carries on, the money coming
     back does not. Kept from a month ago so a repayment that has only just
     stopped is still on the list. */
  const costRises: CostRiseRow[] = items
    .flatMap((it) => {
      if (it.kind !== "expense" || !it.reimb) return [];
      const rEnd = reimbEnd(it);
      if (rEnd === null || rEnd < start - 1) return [];
      const iEnd = fromYM(it.last);
      if (iEnd !== null && rEnd >= iEnd) return [];

      const perMonth =
        it.freq === "monthly" ? it.amount : it.amount * (FREQ[it.freq].per_year / 12);
      let total = 0;
      let n = 0;
      if (iEnd !== null) {
        for (let i = rEnd + 1; i <= iEnd; i++) {
          if (occursIn(it, i)) {
            total += it.amount;
            n++;
          }
        }
      }
      return [
        {
          ...it,
          who: reimbSchedule(it)!.who,
          rEnd,
          iEnd,
          monthsUntil: rEnd - start + 1,
          perMonth,
          total,
          n,
        },
      ];
    })
    .sort((a, b) => a.rEnd - b.rEnd);

  return {
    start,
    horizon,
    months,
    last,
    mIncome,
    mExpense,
    mReimb,
    mSaving,
    mIrregular,
    mInterest,
    totalInterest,
    netCost,
    leftover,
    lowest,
    heaviest,
    floor,
    headroom,
    breach,
    clearsBy,
    worstDrawdown,
    people,
    passThrough,
    goalRows,
    goalsToFund,
    goalsLater,
    assets,
    assetSeries,
    assetsNow,
    assetsEnd,
    putIn,
    growth,
    committed,
    netWorthNow,
    netWorthEnd,
    ending,
    freedTotal,
    costRises,
  };
}

/**
 * Each asset grows (or shrinks) by rate/12 a month, then takes in whatever the
 * saving line linked to it pays in that month.
 */
export function projectAssets(
  assets: Asset[],
  items: Item[],
  horizon: number,
  start: number,
): AssetSeries {
  const vals = assets.map((a) => Number(a.value) || 0);
  const contributed = assets.map(() => 0);
  const rows: AssetPoint[] = [];

  for (let k = 0; k < horizon; k++) {
    const idx = start + k;
    const row: AssetPoint = { idx, name: shortLabel(idx), total: 0 };
    let total = 0;
    assets.forEach((a, i) => {
      vals[i] *= 1 + (Number(a.rate) || 0) / 100 / 12;
      const feed = a.feed ? items.find((it) => it.id === a.feed) : undefined;
      if (feed && occursIn(feed, idx)) {
        vals[i] += feed.amount;
        contributed[i] += feed.amount;
      }
      row[a.id] = Math.round(vals[i]);
      total += vals[i];
    });
    row.total = Math.round(total);
    rows.push(row);
  }

  return { rows, ending: vals, contributed };
}
