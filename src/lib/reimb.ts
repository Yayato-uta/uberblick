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
  paid: YM[];
  deferred: YM[];
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
    paid: r.paid ?? [],
    deferred: r.deferred ?? [],
  };
}

/** Has this month been confirmed as actually received? */
export function isPaid(it: Item, idx: number): boolean {
  const s = reimbSchedule(it);
  if (!s) return false;
  return s.paid.some((m) => fromYM(m) === idx);
}

/**
 * Is this month's instalment being pushed into the next one?
 *
 * An override is the last word on what turned up, so a month that has one is
 * never treated as deferred — the two would otherwise contradict each other.
 */
export function isDeferred(it: Item, idx: number): boolean {
  const s = reimbSchedule(it);
  if (!s) return false;
  if (overrideFor(it, idx) !== null) return false;
  return s.deferred.some((m) => fromYM(m) === idx);
}

/**
 * What rolls into month `idx` from months deferred before it. Walks back while
 * each previous month was pushed on, so a run of deferrals all lands together.
 */
export function carriedInto(it: Item, idx: number): number {
  let total = 0;
  for (let i = idx - 1; isDeferred(it, i); i--) total += scheduledInMonth(it, i);
  return total;
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
  let t: number;
  if (override !== null) {
    t = override;
  } else if (isDeferred(it, idx)) {
    // pushed on: nothing arrives, and what was due travels to the next month
    t = 0;
  } else {
    t = (occursIn(s, idx) ? s.amount : 0) + carriedInto(it, idx);
  }
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
  /* Deferring the last instalment carries it past the agreed end, so the end
     moves with it — otherwise the money would fall off the schedule. */
  const pushed = s.deferred
    .map((m) => fromYM(m))
    .filter((v): v is number => v !== null && v <= sched)
    .map((v) => v + 1);
  return Math.max(sched, ...lumps, ...late, ...pushed);
}

/** Everything coming back over [from, to] inclusive. */
export function reimbBetween(it: Item, from: number, to: number): number {
  let t = 0;
  for (let i = from; i <= to; i++) t += reimbInMonth(it, i);
  return t;
}
