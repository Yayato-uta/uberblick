/* The persisted shape. Kept byte-compatible with the original single-file
   version so old backups import without conversion — the only addition is
   `schemaVersion`, which is absent (treated as 0) in those files. */

export type Kind = "expense" | "income" | "saving";
export type Freq = "monthly" | "quarterly" | "semiannual" | "yearly" | "oneoff";
export type AssetKind = "savings" | "investment" | "vehicle" | "property" | "other";
export type Horizon = 12 | 18 | 24;

/** "YYYY-MM", or "" where an open end is allowed. */
export type YM = string;

/** A lump sum somebody drops in on top of the regular rate. */
export interface ReimbExtra {
  /** "YYYY-MM" */
  month: YM;
  amount: number;
}

/**
 * A repayment runs on its OWN clock — it is not tied to the expense it covers.
 * A one-off paid out in March can come back in twelve monthly instalments, and
 * somebody's share of a loan can finish long before the loan does.
 */
export interface Reimb {
  who: string;
  /** per repayment instalment, always positive */
  amount: number;
  /** INDEPENDENT of the expense's own frequency */
  freq: Freq;
  /** "YYYY-MM"; blank falls back to the expense's first */
  first: YM;
  /** "YYYY-MM"; blank falls back to the expense's last */
  last: YM;
  /** ad-hoc lump sums outside the regular rate */
  extras: ReimbExtra[];
}

export interface Item {
  id: string;
  name: string;
  kind: Kind;
  cat: string;
  /** per occurrence, always positive */
  amount: number;
  freq: Freq;
  /** first occurrence, "YYYY-MM" */
  first: YM;
  /** last occurrence, "YYYY-MM", or "" for ongoing */
  last: YM;
  /** expenses only — somebody sends this much back each time */
  reimb?: Reimb;
}

export interface Goal {
  id: string;
  name: string;
  /** the user's OWN share of the cost, not the total */
  target: number;
  /** month saving starts */
  from: YM;
  /** deadline */
  by: YM;
  /** already put by */
  saved: number;
  /** set once the goal has been turned into a real saving Item */
  itemId?: string;
  /**
   * "YYYY-MM" — the month the pot actually gets spent on the thing. Absent
   * while the goal is only being saved into. The money left the account month by
   * month on the way in, so spending it again would be counting it twice: a
   * spend shows in the breakdown but never touches the balance.
   */
  spend?: YM;
}

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  /** current worth */
  value: number;
  /** % per YEAR, may be negative (a car depreciates) */
  rate: number;
  /** Item.id of the saving line that tops it up */
  feed?: string;
}

export interface Data {
  items: Item[];
  goals: Goal[];
  assets: Asset[];
  /** account balance today — MAY BE NEGATIVE */
  opening: number;
  /** overdraft limit as a positive number, e.g. 6000 */
  overdraft: number;
  /** overdraft interest, % per year, 0 = ignore */
  odRate: number;
  horizon: Horizon;
  /** true while the seed data is still on screen */
  sample: boolean;
  schemaVersion: number;
}
