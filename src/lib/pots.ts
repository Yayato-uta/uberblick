import type { Pot, Purchase } from "../types";
import { fromYM } from "./month";

/* Envelope arithmetic. The only rule that matters: what you don't spend stays
   in the pot. A month's available money is last month's leftover plus this
   month's allocation, so a lean month makes the next one easier — which is the
   whole point of budgeting this way. */

/** The month a purchase falls in, or null if the date is unusable. */
export const purchaseMonth = (p: Purchase): number | null => fromYM(p.date.slice(0, 7));

/** Is this pot funded in month `idx`? */
export function fundedIn(pot: Pot, idx: number): boolean {
  const first = fromYM(pot.from);
  if (first === null || idx < first) return false;
  const last = fromYM(pot.last);
  return last === null || idx <= last;
}

/** What goes into the pot in month `idx`. */
export const allocatedIn = (pot: Pot, idx: number): number =>
  fundedIn(pot, idx) ? Number(pot.monthly) || 0 : 0;

/** What was spent out of the pot in month `idx`. */
export function spentIn(pot: Pot, purchases: Purchase[], idx: number): number {
  let t = 0;
  for (const p of purchases) {
    if (p.potId !== pot.id) continue;
    if (purchaseMonth(p) === idx) t += Number(p.amount) || 0;
  }
  return t;
}

/**
 * What is in the pot at the end of month `idx` — everything ever put in, less
 * everything ever taken out. Runs from the pot's first funded month, so the
 * opening figure is what it held before the app started counting.
 */
export function balanceAt(pot: Pot, purchases: Purchase[], idx: number): number {
  const first = fromYM(pot.from);
  let bal = Number(pot.opening) || 0;
  if (first !== null) {
    for (let i = first; i <= idx; i++) bal += allocatedIn(pot, i);
  }
  for (const p of purchases) {
    if (p.potId !== pot.id) continue;
    const m = purchaseMonth(p);
    if (m !== null && m <= idx) bal -= Number(p.amount) || 0;
  }
  return bal;
}

export interface PotMonth {
  /** left over from last month, and so already yours to spend */
  carriedIn: number;
  /** put in this month */
  allocated: number;
  /** carriedIn + allocated — the most you can spend without going over */
  available: number;
  spent: number;
  /** what's still in the pot at this point */
  left: number;
  /** spent as a share of available, 0–100 and clamped for the bar */
  usedPct: number;
  /** spent more than the pot held */
  over: boolean;
  /** funded in this month at all */
  funded: boolean;
}

/** How one pot stands in one month. */
export function potMonth(pot: Pot, purchases: Purchase[], idx: number): PotMonth {
  const carriedIn = balanceAt(pot, purchases, idx - 1);
  const allocated = allocatedIn(pot, idx);
  const available = carriedIn + allocated;
  const spent = spentIn(pot, purchases, idx);
  const left = available - spent;
  return {
    carriedIn,
    allocated,
    available,
    spent,
    left,
    usedPct: available > 0 ? Math.min(100, Math.max(0, (spent / available) * 100)) : spent > 0 ? 100 : 0,
    over: left < -0.005,
    funded: fundedIn(pot, idx),
  };
}

/** Every purchase against a pot in one month, newest first. */
export function purchasesIn(pot: Pot, purchases: Purchase[], idx: number): Purchase[] {
  return purchases
    .filter((p) => p.potId === pot.id && purchaseMonth(p) === idx)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** What every pot together takes out of the account in month `idx`. */
export function allocatedTotal(pots: Pot[], idx: number): number {
  let t = 0;
  for (const pot of pots) t += allocatedIn(pot, idx);
  return t;
}
