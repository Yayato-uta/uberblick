import type { Freq, Item, YM } from "../types";

/* Everything in the app is at year-month granularity. An "index" is an
   absolute month number: year * 12 + monthIndex0, so Aug 2026 is 24319. */

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The month we are in right now. */
export function nowIdx(): number {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
}

/** index -> "YYYY-MM" */
export function toYM(i: number): YM {
  return `${Math.floor(i / 12)}-${pad2((i % 12) + 1)}`;
}

/** "YYYY-MM" -> index, or null for "" / anything unparseable */
export function fromYM(s: YM | null | undefined): number | null {
  if (!s) return null;
  const parts = String(s).split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  if (!y || !m || m < 1 || m > 12) return null;
  return y * 12 + (m - 1);
}

export const year = (i: number): number => Math.floor(i / 12);
export const month0 = (i: number): number => ((i % 12) + 12) % 12;

/** "Aug 26" */
export const shortLabel = (i: number): string => `${MONTHS[month0(i)]} ${String(year(i)).slice(2)}`;

/** "Aug 2026" */
export const longLabel = (i: number): string => `${MONTHS[month0(i)]} ${year(i)}`;

/** "August 2026" */
export const fullLabel = (i: number): string => `${MONTHS_LONG[month0(i)]} ${year(i)}`;

/** How many times a year each frequency comes round. One-offs: none. */
export const PER_YEAR: Record<Freq, number> = {
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  yearly: 1,
  oneoff: 0,
};

/** The gap in months between occurrences, or null when there is no repeat. */
export const STEP: Record<Freq, number | null> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
  oneoff: null,
};

/**
 * Does this item fall due in month `idx`?
 *
 * The schedule is anchored on `first`, not on January — a quarterly bill first
 * paid in September recurs in December, March and June.
 */
export function occursIn(item: Pick<Item, "first" | "last" | "freq">, idx: number): boolean {
  const first = fromYM(item.first);
  if (first === null || idx < first) return false;
  const last = fromYM(item.last);
  if (last !== null && idx > last) return false;
  const d = idx - first;
  switch (item.freq) {
    case "monthly":
      return true;
    case "quarterly":
      return d % 3 === 0;
    case "semiannual":
      return d % 6 === 0;
    case "yearly":
      return d % 12 === 0;
    case "oneoff":
      return d === 0;
    default:
      return false;
  }
}

/** How many occurrences fall in [from, to] inclusive. */
export function countOccurrences(
  item: Pick<Item, "first" | "last" | "freq">,
  from: number,
  to: number,
): number {
  let n = 0;
  for (let i = from; i <= to; i++) if (occursIn(item, i)) n++;
  return n;
}

/** The monthly equivalent of a non-monthly amount. One-offs spread to nothing. */
export function monthlyEquivalent(amount: number, freq: Freq): number {
  return freq === "oneoff" ? 0 : amount * (PER_YEAR[freq] / 12);
}
