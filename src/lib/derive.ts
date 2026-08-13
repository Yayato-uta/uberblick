import type { Asset, Data, Goal, Item } from "../types";
import { FREQ } from "./constants";
import { avgOf, forecast, sumOf, type MonthRow } from "./forecast";
import { fromYM, nowIdx, occursIn, shortLabel } from "./month";

/* Everything the views read is computed here, in one pass, from the persisted
   data alone. Views stay dumb; the arithmetic stays testable. */

export interface PersonItem extends Item {
  /** total still to come from this person on this item, "" end date aside */
  total: number;
  lastIdx: number | null;
}

export interface Person {
  who: string;
  /** average per month across the horizon, not the per-payment amount */
  monthly: number;
  outstanding: number;
  /** at least one item has no end date */
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

  /* ── who pays me back ── */
  const map = new Map<string, Person>();
  for (const it of items) {
    if (it.kind !== "expense" || !it.reimb) continue;
    const who = it.reimb.who || "Someone";
    let p = map.get(who);
    if (!p) {
      p = { who, monthly: 0, outstanding: 0, ongoing: false, items: [] };
      map.set(who, p);
    }
    const lastIdx = fromYM(it.last);
    let total = 0;
    if (lastIdx === null) {
      p.ongoing = true;
    } else {
      for (let i = start; i <= lastIdx; i++) if (occursIn(it, i)) total += it.reimb.amount;
    }
    let overHorizon = 0;
    for (const m of months) if (occursIn(it, m.idx)) overHorizon += it.reimb.amount;
    p.monthly += months.length ? overHorizon / months.length : 0;
    p.outstanding += total;
    p.items.push({ ...it, total, lastIdx });
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
    for (let i = start; i <= lastIdx; i++) {
      if (occursIn(it, i)) t += it.amount - (it.reimb ? it.reimb.amount : 0);
    }
    return s + t;
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
      const back = it.reimb
        ? it.freq === "monthly"
          ? it.reimb.amount
          : it.reimb.amount * (FREQ[it.freq].per_year / 12)
        : 0;
      return [{ ...it, lastIdx, monthsLeft: lastIdx - start + 1, perMonth, net: perMonth - back }];
    })
    .sort((a, b) => a.lastIdx - b.lastIdx);

  const freedTotal = ending.reduce((s, i) => s + Math.max(0, i.net), 0);

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
