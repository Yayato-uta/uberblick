import type { Item, MonthAmount } from "../types";
import { fromYM, occursIn } from "./month";

/* What a line actually did in a month, as opposed to what the plan says it
   should do. Recording it never changes the agreement — only that month. */

/** Has this line been confirmed as actually paid in month `idx`? */
export function isItemPaid(it: Item, idx: number): boolean {
  const rows = it.paid;
  if (!rows) return false;
  return rows.some((m) => fromYM(m) === idx);
}

/** What actually went out in month `idx`, or null when the usual amount stands. */
export function actualFor(it: Item, idx: number): number | null {
  const rows = it.actuals;
  if (!rows) return null;
  for (const a of rows) if (fromYM(a.month) === idx) return Number(a.amount) || 0;
  return null;
}

/**
 * The amount for month `idx` — what actually happened if it was recorded,
 * otherwise the scheduled amount, and nothing at all in a month it doesn't
 * fall due.
 *
 * A recorded amount stands even in a month the schedule skips, because money
 * genuinely can go out in a month the plan didn't expect.
 */
export function amountIn(it: Item, idx: number): number {
  const actual = actualFor(it, idx);
  if (actual !== null) return actual;
  return occursIn(it, idx) ? it.amount : 0;
}

/** Does this line touch month `idx` at all — scheduled, or recorded? */
export const touchesMonth = (it: Item, idx: number): boolean =>
  occursIn(it, idx) || actualFor(it, idx) !== null;

/** Every month this line was recorded as going differently, soonest first. */
export function recordedMonths(it: Item): MonthAmount[] {
  return [...(it.actuals ?? [])].sort((a, b) => (a.month < b.month ? -1 : 1));
}
