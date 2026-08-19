import type { Item } from "../types";
import { occursIn, shortLabel } from "./month";
import { reimbInMonth } from "./reimb";

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
}

export interface ForecastInput {
  items: Item[];
  opening: number;
  odRate: number;
  horizon: number;
  start: number;
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
export function forecast({ items, opening, odRate, horizon, start }: ForecastInput): MonthRow[] {
  const rows: MonthRow[] = [];
  const rate = (Number(odRate) || 0) / 100 / 12;
  let bal = Number(opening) || 0;

  for (let k = 0; k < horizon; k++) {
    const idx = start + k;
    let income = 0;
    let expense = 0;
    let saving = 0;
    let reimb = 0;
    let irregular = 0;
    const hits: Item[] = [];

    for (const it of items) {
      const back = it.kind === "expense" ? reimbInMonth(it, idx) : 0;
      const due = occursIn(it, idx);
      if (!due && back === 0) continue;
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

    let net = income + reimb - expense - saving;
    bal += net;
    const interest = bal < 0 ? -bal * rate : 0;
    bal -= interest;
    net -= interest;

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
    });
  }

  return rows;
}

/** Mean of one column across the horizon. All headline figures are means. */
export function avgOf(
  rows: MonthRow[],
  key: "income" | "expense" | "saving" | "reimb" | "irregular" | "interest" | "net",
): number {
  if (!rows.length) return 0;
  let s = 0;
  for (const r of rows) s += r[key];
  return s / rows.length;
}

export function sumOf(
  rows: MonthRow[],
  key: "income" | "expense" | "saving" | "reimb" | "irregular" | "interest" | "net",
): number {
  let s = 0;
  for (const r of rows) s += r[key];
  return s;
}
