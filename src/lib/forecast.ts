import type { Item, Pot } from "../types";
import { occursIn, shortLabel } from "./month";
import { reimbInMonth } from "./reimb";
import { allocatedTotal, paidFrom } from "./pots";

/** Money paid out of a fund rather than out of the current account. */
export interface Spend {
  /** absolute month */
  idx: number;
  /** the goal id, or the item id for an expense paid from a fund */
  id: string;
  name: string;
  amount: number;
  /** a goal's pot being spent, or an expense line drawing on a fund */
  from: "goal" | "fund";
  /** the Asset drawn down, where there is one to draw down */
  assetId?: string;
}

export interface MonthRow {
  /** absolute month index */
  idx: number;
  /** 0-based position within the horizon */
  k: number;
  /** "Aug 26" */
  name: string;
  income: number;
  expense: number;
  saving: number;
  reimb: number;
  /** the part of `expense` that comes from non-monthly items */
  irregular: number;
  interest: number;
  net: number;
  /** balance at month end, rounded to the euro for display */
  balance: number;
  /** every item that touches this month — money out, money back, or both */
  hits: Item[];
  /**
   * Paid this month out of money already set aside. Deliberately absent from
   * `net` and `balance`: it left the account monthly on the way into the pot,
   * so charging it again would count it twice.
   */
  fromSavings: number;
  spends: Spend[];
  /**
   * Moved into budget pots this month. This is the cash outflow for a pot —
   * what leaves the account whether or not anything is spent from it — so it
   * sits beside `expense` rather than inside it.
   */
  potFund: number;
  /**
   * Expenses drawn from a pot this month. Already funded on the way in, so it
   * must never reach the account a second time; it is here to be shown, not to
   * be added to anything.
   */
  potSpend: number;
}

export interface ForecastInput {
  items: Item[];
  opening: number;
  odRate: number;
  horizon: number;
  start: number;
  /**
   * Goal pots being spent. Expenses carrying a `fund` are picked up from
   * `items` and need not be passed in here.
   */
  spends?: Spend[];
  /** budget envelopes; their monthly allocation is part of what a month costs */
  pots?: Pot[];
}

/**
 * Roll the account forward month by month.
 *
 * Overdraft interest is charged on whatever is still negative at month end and
 * therefore compounds — deliberately, because the point is to show what an
 * overdraft costs when it lingers.
 *
 * A repayment runs on its own clock, so a month can carry money coming back
 * with no payment going out — a one-off paid in March, repaid monthly for the
 * rest of the year. Those months count, and the item belongs in `hits`.
 */
export function forecast({
  items,
  opening,
  odRate,
  horizon,
  start,
  spends = [],
  pots = [],
}: ForecastInput): MonthRow[] {
  const rows: MonthRow[] = [];
  const potIds = new Set(pots.map((p) => p.id));
  const rate = (Number(odRate) || 0) / 100 / 12;
  let bal = Number(opening) || 0;

  for (let k = 0; k < horizon; k++) {
    const idx = start + k;
    let income = 0;
    let expense = 0;
    let saving = 0;
    let reimb = 0;
    let irregular = 0;
    let potSpend = 0;
    const hits: Item[] = [];
    const drawn: Spend[] = [];

    for (const it of items) {
      const back = it.kind === "expense" ? reimbInMonth(it, idx) : 0;
      const due = occursIn(it, idx);
      if (!due && back === 0) continue;

      /* An expense paid from a pot or a fund never reaches the current account,
         so it belongs in neither `expense` nor the balance. A pot was funded on
         the way in; a fund is simply drawn down. */
      const source = it.kind === "expense" ? paidFrom(it) : null;
      if (source) {
        hits.push(it);
        if (due) {
          /* A pot and an asset are both "not the account", but they are shown
             in different places and must not be listed twice: a pot draw is
             counted here, an asset draw goes on the spends list. */
          if (potIds.has(source)) potSpend += it.amount;
          else
            drawn.push({
              idx,
              id: it.id,
              name: it.name,
              amount: it.amount,
              from: "fund",
              assetId: source,
            });
        }
        if (back > 0) reimb += back;
        continue;
      }

      hits.push(it);
      if (!due) {
        // money back in a month with nothing going out
        reimb += back;
        continue;
      }
      if (it.kind === "income") {
        income += it.amount;
      } else if (it.kind === "saving") {
        saving += it.amount;
      } else {
        expense += it.amount;
        if (it.freq !== "monthly") irregular += it.amount;
        reimb += back;
      }
    }

    // funding a pot is itself an outflow, kept apart from the bills
    const potFund = allocatedTotal(pots, idx);

    let net = income + reimb - expense - potFund - saving;
    bal += net;
    const interest = bal < 0 ? -bal * rate : 0;
    bal -= interest;
    net -= interest;

    const spent = [...spends.filter((sp) => sp.idx === idx), ...drawn];

    rows.push({
      idx,
      k,
      name: shortLabel(idx),
      income,
      expense,
      saving,
      reimb,
      irregular,
      interest,
      net,
      balance: Math.round(bal),
      hits,
      fromSavings: spent.reduce((t, sp) => t + sp.amount, 0),
      spends: spent,
      potFund,
      potSpend,
    });
  }

  return rows;
}

/** The columns of a month that are plain numbers, and so can be averaged. */
export type NumericColumn =
  | "income"
  | "expense"
  | "saving"
  | "reimb"
  | "irregular"
  | "interest"
  | "net"
  | "potFund"
  | "potSpend"
  | "fromSavings";

/** Mean of one column across the horizon. All headline figures are means. */
export function avgOf(
  rows: MonthRow[],
  key: NumericColumn,
): number {
  if (!rows.length) return 0;
  let s = 0;
  for (const r of rows) s += r[key];
  return s / rows.length;
}

export function sumOf(
  rows: MonthRow[],
  key: NumericColumn,
): number {
  let s = 0;
  for (const r of rows) s += r[key];
  return s;
}
