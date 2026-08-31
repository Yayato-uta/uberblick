/* The persisted shape. Kept byte-compatible with the original single-file
   version so old backups import without conversion — the only addition is
   `schemaVersion`, which is absent (treated as 0) in those files. */

export type Kind = "expense" | "income" | "saving";
export type Freq = "monthly" | "quarterly" | "semiannual" | "yearly" | "oneoff";
export type AssetKind = "savings" | "investment" | "vehicle" | "property" | "other";
export type PotKind = "spending" | "saving";
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
  /**
   * Lump sums ON TOP of the agreed rate — money beyond what was owed, like a
   * bonus put toward it. These add to the month they land in.
   */
  extras: ReimbExtra[];
  /**
   * Money paid AHEAD. It arrives in the month named and then settles the
   * instalments from that month on, one by one, until it is used up — so the
   * total owed is unchanged and only its timing moves. Anything still unused
   * is credit the payer is ahead by.
   */
  advances: ReimbExtra[];
  /**
   * What actually came in a given month, INSTEAD of the scheduled instalment.
   * Zero means they paid nothing that month; a smaller figure means they paid
   * less; a run of them is a pause. Absent months follow the schedule.
   */
  overrides: ReimbExtra[];
  /**
   * Months confirmed as actually received. This changes no figure — the plan
   * already assumes the money arrives — it records that you have seen it, so
   * an unconfirmed month past its date stands out.
   */
  paid: YM[];
  /**
   * Months whose instalment was pushed into the following month. Nothing
   * arrives in the month named, and the one after it gets that instalment on
   * top of its own. Defer two in a row and both land in the third.
   */
  deferred: YM[];
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
  /**
   * Expenses only — where the money comes from: "account" (or absent) for the
   * current account, otherwise a `Pot.id` or an `Asset.id`.
   *
   * Money paid from either never touches the account twice. A pot's own monthly
   * funding is what shows in the cash flow; an asset is simply drawn down.
   */
  from?: string;
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

/**
 * An envelope inside your money: funded from the account every month, keeping
 * whatever it doesn't spend, and nameable as the source of an expense.
 *
 * A pot is a spending plan, not something you own, which is why it lives apart
 * from `Asset` and its growth rates. Two things draw one down: expenses that
 * name it as their source, and purchases logged against it as they happen.
 */
export interface Pot {
  id: string;
  name: string;
  /** a spending pot refills to be spent; a saving pot builds toward something */
  kind: PotKind;
  /** funded from the account each month */
  monthly: number;
  /** what is in it today */
  balance: number;
  /** first month it's funded, "YYYY-MM" */
  first: YM;
  /** last month it's funded, "" for ongoing */
  last: YM;
}

/** One thing you actually bought, charged against a pot. */
export interface Purchase {
  id: string;
  potId: string;
  /** "YYYY-MM-DD" — the day granularity exists only here */
  date: string;
  /** what it was, free text, may be blank */
  note: string;
  amount: number;
}

export interface Data {
  items: Item[];
  goals: Goal[];
  assets: Asset[];
  pots: Pot[];
  purchases: Purchase[];
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
