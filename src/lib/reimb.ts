import type { Freq, Item, ReimbExtra, YM } from "../types";
import { fromYM, occursIn } from "./month";

/* A repayment keeps its own clock. Three cases all have to work:

   1. a lump sum paid out once, repaid to you monthly over a year
   2. a monthly financing where lump sums land on top of the regular rate
   3. a shared loan whose repayments stop before the loan does

   So none of this may be derived from the expense's own frequency or dates —
   they are only the fallback when the repayment leaves a field blank. */

export interface ReimbSchedule {
  who: string;
  amount: number;
  freq: Freq;
  first: YM;
  last: YM;
  extras: ReimbExtra[];
  overrides: ReimbExtra[];
}

/** The repayment's effective schedule, with blank dates filled from the item. */
export function reimbSchedule(it: Item): ReimbSchedule | null {
  const r = it.reimb;
  if (!r) return null;
  return {
    who: r.who || "Someone",
    amount: Number(r.amount) || 0,
    freq: r.freq || "monthly",
    first: r.first || it.first,
    last: r.last === undefined || r.last === "" ? it.last : r.last,
    extras: r.extras ?? [],
    overrides: r.overrides ?? [],
  };
}

/** What was agreed for this month, before any override. */
export function scheduledInMonth(it: Item, idx: number): number {
  const s = reimbSchedule(it);
  if (!s) return 0;
  return occursIn(s, idx) ? s.amount : 0;
}

/** The override for this month, or null when the schedule stands. */
export function overrideFor(it: Item, idx: number): number | null {
  const s = reimbSchedule(it);
  if (!s) return null;
  for (const o of s.overrides) {
    if (fromYM(o.month) === idx) return Number(o.amount) || 0;
  }
  return null;
}

/**
 * What comes back in month `idx`.
 *
 * The instalment the schedule calls for, unless that month has an override
 * saying what actually turned up — nothing, or less, or more. Lump sums are
 * added on top either way, since they are extra by definition.
 */
export function reimbInMonth(it: Item, idx: number): number {
  const s = reimbSchedule(it);
  if (!s) return 0;
  const override = overrideFor(it, idx);
  let t = override !== null ? override : occursIn(s, idx) ? s.amount : 0;
  for (const e of s.extras) if (fromYM(e.month) === idx) t += Number(e.amount) || 0;
  return t;
}

/**
 * The last month anything is expected back, or null when the repayment is
 * open-ended. An open-ended schedule stays open even if lump sums are listed —
 * a dated lump sum can't put an end date on something that has none.
 */
export function reimbEnd(it: Item): number | null {
  const s = reimbSchedule(it);
  if (!s) return null;
  const sched = fromYM(s.last);
  if (sched === null) return null;
  const lumps = s.extras
    .map((e) => fromYM(e.month))
    .filter((v): v is number => v !== null);
  /* An override that pays something in a month past the agreed end still puts
     money in your hand, so it counts; one that pays nothing cannot extend it. */
  const late = s.overrides
    .filter((o) => (Number(o.amount) || 0) > 0)
    .map((o) => fromYM(o.month))
    .filter((v): v is number => v !== null);
  return Math.max(sched, ...lumps, ...late);
}

/** Everything coming back over [from, to] inclusive. */
export function reimbBetween(it: Item, from: number, to: number): number {
  let t = 0;
  for (let i = from; i <= to; i++) t += reimbInMonth(it, i);
  return t;
}
