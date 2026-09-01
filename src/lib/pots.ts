import type { Item, Pot, Purchase } from "../types";
import { fromYM, shortLabel } from "./month";
import { amountIn, touchesMonth } from "./actual";

/* Envelope arithmetic. The only rule that matters: what you don't spend stays
   in the pot. A month's available money is last month's leftover plus this
   month's allocation, so a lean month makes the next one easier — which is the
   whole point of budgeting this way. */

/** The month a purchase falls in, or null if the date is unusable. */
export const purchaseMonth = (p: Purchase): number | null => fromYM(p.date.slice(0, 7));

/** Where an expense is paid from, or null when it comes out of the account. */
export const paidFrom = (it: Item): string | null =>
  it.from && it.from !== "account" ? it.from : null;

/** Is this pot funded in month `idx`? */
export function fundedIn(pot: Pot, idx: number): boolean {
  const first = fromYM(pot.first);
  if (first === null || idx < first) return false;
  const last = fromYM(pot.last);
  return last === null || idx <= last;
}

/** The scheduled expenses drawn from this pot in month `idx`. */
export function drawsIn(pot: Pot, items: Item[], idx: number): Item[] {
  return items.filter(
    (it) => it.kind === "expense" && paidFrom(it) === pot.id && touchesMonth(it, idx),
  );
}

/** What those expenses actually came to that month. */
export const drawnIn = (pot: Pot, items: Item[], idx: number): number =>
  drawsIn(pot, items, idx).reduce((t, it) => t + amountIn(it, idx), 0);

/** What goes into the pot in month `idx`. */
export const allocatedIn = (pot: Pot, idx: number): number =>
  fundedIn(pot, idx) ? Number(pot.monthly) || 0 : 0;

/** What was logged as bought out of the pot in month `idx`. */
export function loggedIn(pot: Pot, purchases: Purchase[], idx: number): number {
  let t = 0;
  for (const p of purchases) {
    if (p.potId !== pot.id) continue;
    if (purchaseMonth(p) === idx) t += Number(p.amount) || 0;
  }
  return t;
}

/**
 * Everything that came out of the pot in month `idx` — the expenses that name
 * it as their source, plus anything logged against it by hand.
 */
export const spentIn = (pot: Pot, purchases: Purchase[], idx: number, items: Item[] = []): number =>
  loggedIn(pot, purchases, idx) + drawnIn(pot, items, idx);

/**
 * What is in the pot at the end of month `idx` — everything ever put in, less
 * everything ever taken out. Runs from the pot's first funded month, so the
 * opening figure is what it held before the app started counting.
 */
export function balanceAt(
  pot: Pot,
  purchases: Purchase[],
  idx: number,
  items: Item[] = [],
): number {
  const first = fromYM(pot.first);
  let bal = Number(pot.balance) || 0;
  if (first !== null) {
    for (let i = first; i <= idx; i++) bal += allocatedIn(pot, i) - drawnIn(pot, items, i);
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
export function potMonth(
  pot: Pot,
  purchases: Purchase[],
  idx: number,
  items: Item[] = [],
): PotMonth {
  const carriedIn = balanceAt(pot, purchases, idx - 1, items);
  const allocated = allocatedIn(pot, idx);
  const available = carriedIn + allocated;
  const spent = spentIn(pot, purchases, idx, items);
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

/**
 * The pot balance carried across the horizon, plus the low-water mark that
 * says whether it ever runs dry. Balances carry forward — never reset.
 */
export interface PotSeries {
  rows: Record<string, number | string>[];
  /** balance at the end of the horizon, in `pots` order */
  ending: number[];
  /** the lowest it ever gets, in `pots` order */
  low: number[];
  /** everything drawn out of it across the horizon, in `pots` order */
  spent: number[];
}

export function projectPots(
  pots: Pot[],
  items: Item[],
  purchases: Purchase[],
  horizon: number,
  start: number,
): PotSeries {
  // start from where each pot stands going into the first month shown
  const bal = pots.map((p) => balanceAt(p, purchases, start - 1, items));
  const low = [...bal];
  const spent = pots.map(() => 0);
  const rows: Record<string, number | string>[] = [];

  for (let k = 0; k < horizon; k++) {
    const idx = start + k;
    const row: Record<string, number | string> = { idx, name: shortLabel(idx) };
    pots.forEach((p, i) => {
      bal[i] += allocatedIn(p, idx);
      const out = spentIn(p, purchases, idx, items);
      bal[i] -= out;
      spent[i] += out;
      if (bal[i] < low[i]) low[i] = bal[i];
      row[p.id] = Math.round(bal[i]);
    });
    rows.push(row);
  }

  return { rows, ending: bal, low, spent };
}

/** What every pot together takes out of the account in month `idx`. */
export function allocatedTotal(pots: Pot[], idx: number): number {
  let t = 0;
  for (const pot of pots) t += allocatedIn(pot, idx);
  return t;
}
