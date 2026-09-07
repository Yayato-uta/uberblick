import {
  Car,
  Home,
  Landmark,
  Package,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type {
  AssetKind,
  Data,
  Freq,
  Item,
  Kind,
  Pot,
  PotKind,
  Purchase,
  Snapshot,
  StockBook,
  StockFacts,
} from "../types";
import { nowIdx, toYM } from "./month";
import { uid } from "./format";
import { LIGHT, type Palette } from "./palette";
import { DEFAULT_ASSUMPTIONS, isoWeek } from "./valuation";

export const KIND: Record<Kind, { label: string; tone: keyof Palette }> = {
  expense: { label: "Expense", tone: "red" },
  income: { label: "Income", tone: "green" },
  saving: { label: "Saving / investing", tone: "blue" },
};

export const FREQ: Record<Freq, { label: string; per_year: number }> = {
  monthly: { label: "Every month", per_year: 12 },
  quarterly: { label: "Every 3 months", per_year: 4 },
  semiannual: { label: "Every 6 months", per_year: 2 },
  yearly: { label: "Once a year", per_year: 1 },
  oneoff: { label: "One time only", per_year: 0 },
};

/* A pot is an envelope inside your money: funded monthly from the account,
   carrying whatever it doesn't spend into the next month. */
export const POT_KINDS: Record<PotKind, { label: string; note: string; tone: keyof Palette }> = {
  spending: {
    label: "Spending pot",
    note: "refills each month, meant to be spent",
    tone: "ochre",
  },
  saving: { label: "Saving pot", note: "builds up toward something", tone: "blue" },
};

export const CATEGORIES = [
  "Home",
  "Utilities",
  "Phone & internet",
  "Insurance",
  "Transport",
  "Food",
  "Health",
  "Subscriptions",
  "Debt & financing",
  "Family",
  "Savings",
  "Investing",
  "Salary",
  "Other",
] as const;

export const ASSET_KINDS: Record<
  AssetKind,
  { label: string; icon: LucideIcon; rate: number; tone: keyof Palette }
> = {
  savings: { label: "Savings account", icon: Landmark, rate: 1, tone: "blue" },
  investment: { label: "Investments", icon: TrendingUp, rate: 5, tone: "green" },
  vehicle: { label: "Car or vehicle", icon: Car, rate: -15, tone: "ochre" },
  property: { label: "Property", icon: Home, rate: 2, tone: "violet" },
  other: { label: "Something else", icon: Package, rate: 0, tone: "teal" },
};

/** Colour for an asset kind out of whichever palette is live. */
export const assetColor = (kind: AssetKind, p: Palette = LIGHT): string =>
  p[ASSET_KINDS[kind].tone];

export const HORIZONS = [12, 18, 24] as const;

export const STORAGE_KEY = "uberblick:v1";
export const THEME_KEY = "uberblick:theme";
export const LAST_EXPORT_KEY = "uberblick:last-export";
export const INSTALL_HINT_KEY = "uberblick:ios-hint-seen";

export const SCHEMA_VERSION = 2;

/** An empty plan — what "Start empty" leaves you with. */
export function emptyData(): Data {
  return {
    items: [],
    goals: [],
    assets: [],
    pots: [],
    purchases: [],
    opening: 0,
    overdraft: 0,
    odRate: 0,
    horizon: 12,
    sample: false,
    stocks: emptyStockBook(),
    schemaVersion: SCHEMA_VERSION,
  };
}

/** An unused stock screen: the assumptions, and no week of figures yet. */
export function emptyStockBook(): StockBook {
  return {
    snapshots: [],
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    shortlist: 5,
    auto: true,
    lastFetch: "",
  };
}

/**
 * Illustrative numbers, so a first-time opener sees what the thing does before
 * typing anything. Deliberately generic and rounded — nobody's actual budget —
 * while still exercising every case the app exists to show: pay that arrives in
 * yearly lumps, bills that don't fall due monthly, a financing line that ends
 * soon, and two lines somebody else pays back.
 */
export function sampleItems(): Item[] {
  const T = nowIdx();
  return [
    { id: uid(), name: "Salary (net)", kind: "income", cat: "Salary", amount: 2400, freq: "monthly", first: toYM(T - 12), last: "" },
    { id: uid(), name: "Holiday pay", kind: "income", cat: "Salary", amount: 1400, freq: "yearly", first: toYM(T - 12 + 5), last: "" },
    { id: uid(), name: "Year-end pay", kind: "income", cat: "Salary", amount: 1400, freq: "yearly", first: toYM(T - 12 + 10), last: "" },

    { id: uid(), name: "Rent & service charges", kind: "expense", cat: "Home", amount: 900, freq: "monthly", first: toYM(T - 12), last: "" },
    { id: uid(), name: "Groceries & household", kind: "expense", cat: "Food", amount: 400, freq: "monthly", first: toYM(T - 12), last: "" },
    { id: uid(), name: "Electricity & gas", kind: "expense", cat: "Utilities", amount: 200, freq: "quarterly", first: toYM(T - 1), last: "" },
    { id: uid(), name: "Internet & mobile", kind: "expense", cat: "Phone & internet", amount: 45, freq: "monthly", first: toYM(T - 12), last: "" },
    { id: uid(), name: "Broadcasting fee", kind: "expense", cat: "Subscriptions", amount: 45, freq: "quarterly", first: toYM(T), last: "" },
    { id: uid(), name: "Home insurance", kind: "expense", cat: "Insurance", amount: 250, freq: "yearly", first: toYM(T + 1), last: "" },
    { id: uid(), name: "Annual transport pass", kind: "expense", cat: "Transport", amount: 400, freq: "yearly", first: toYM(T + 5), last: "" },

    { id: uid(), name: "Appliance instalments", kind: "expense", cat: "Debt & financing", amount: 50, freq: "monthly", first: toYM(T - 9), last: toYM(T + 2) },
    { id: uid(), name: "Shared loan", kind: "expense", cat: "Debt & financing", amount: 300, freq: "monthly", first: toYM(T - 5), last: toYM(T + 31), reimb: { who: "Partner", amount: 300, freq: "monthly", first: "", last: "", extras: [], advances: [], overrides: [], paid: [], deferred: [] } },
    { id: uid(), name: "Second phone contract", kind: "expense", cat: "Family", amount: 30, freq: "monthly", first: toYM(T - 3), last: toYM(T + 20), reimb: { who: "Family member", amount: 30, freq: "monthly", first: "", last: "", extras: [], advances: [], overrides: [], paid: [], deferred: [] } },

    { id: uid(), name: "Savings plan", kind: "saving", cat: "Savings", amount: 100, freq: "monthly", first: toYM(T - 12), last: "" },
    { id: uid(), name: "Investment plan", kind: "saving", cat: "Investing", amount: 150, freq: "monthly", first: toYM(T - 12), last: "" },
  ];
}

/**
 * One budget pot with a month behind it, so the carry-over is visible straight
 * away rather than needing a month of use to appear.
 */
export function samplePots(): { pots: Pot[]; purchases: Purchase[] } {
  const T = nowIdx();
  const potId = uid();
  const day = (idx: number, d: number) => `${toYM(idx)}-${String(d).padStart(2, "0")}`;
  return {
    pots: [
      {
        id: potId,
        name: "Groceries",
        kind: "spending",
        monthly: 400,
        balance: 0,
        first: toYM(T - 1),
        last: "",
      },
    ],
    purchases: [
      { id: uid(), potId, date: day(T - 1, 4), note: "Weekly shop", amount: 96.4 },
      { id: uid(), potId, date: day(T - 1, 18), note: "Weekly shop", amount: 112.8 },
      { id: uid(), potId, date: day(T, 3), note: "Weekly shop", amount: 88.15 },
    ],
  };
}

/**
 * A week of figures for eight companies that do not exist.
 *
 * The screen is worthless without a list to rank, and an empty screen teaches
 * nothing — but an illustration made of REAL tickers would be a set of stale
 * figures wearing the name of a company somebody could go and buy. So these
 * are invented, plainly labelled as invented, and chosen to put every case the
 * screen has to handle on one page at once: a sound business going cheap, a
 * fine business at a dear price, a profitable one that is cheap because it is
 * quietly failing, one losing money that no model will value at all, a
 * cyclical at what looks like a bargain right as its revenue turns down, and
 * one with half its figures missing.
 *
 * Figures are in euro, per share where the field says per share, absolute
 * where it doesn't. Every company has 100 million shares, which makes the
 * arithmetic easy to check by hand.
 */
export function sampleFacts(): StockFacts[] {
  const co = (
    ticker: string,
    name: string,
    sector: string,
    rest: Omit<StockFacts, "ticker" | "name" | "sector" | "currency" | "shares">,
  ): StockFacts => ({ ticker, name, sector, currency: "EUR", shares: 100_000_000, ...rest });

  return [
    co("EXA", "Example Industrials", "Industrials", {
      price: 42, eps: 5.6, bookValue: 38, revenuePerShare: 61, dividend: 1.9,
      freeCashFlow: 520_000_000, ebit: 760_000_000, ebitda: 1_010_000_000,
      totalDebt: 900_000_000, cash: 610_000_000, equity: 3_800_000_000,
      roe: 0.15, epsGrowth: 0.05, revenueGrowth: 0.03,
    }),
    co("EXB", "Example Software", "Technology", {
      price: 168, eps: 3.4, bookValue: 14, revenuePerShare: 21, dividend: 0,
      freeCashFlow: 480_000_000, ebit: 520_000_000, ebitda: 610_000_000,
      totalDebt: 120_000_000, cash: 1_400_000_000, equity: 2_200_000_000,
      roe: 0.26, epsGrowth: 0.18, revenueGrowth: 0.15,
    }),
    co("EXC", "Example Retail Group", "Consumer", {
      price: 9.4, eps: 0.75, bookValue: 22, revenuePerShare: 88, dividend: 0.6,
      freeCashFlow: 40_000_000, ebit: 190_000_000, ebitda: 430_000_000,
      totalDebt: 2_600_000_000, cash: 180_000_000, equity: 2_200_000_000,
      roe: 0.03, epsGrowth: -0.12, revenueGrowth: -0.04,
    }),
    co("EXD", "Example Biotech", "Healthcare", {
      price: 27, eps: -1.9, bookValue: 6.2, revenuePerShare: 2.1, dividend: 0,
      freeCashFlow: -210_000_000, ebit: -240_000_000, ebitda: -190_000_000,
      totalDebt: 50_000_000, cash: 640_000_000, equity: 620_000_000,
      roe: -0.31, epsGrowth: null, revenueGrowth: 0.42,
    }),
    co("EXE", "Example Energy", "Energy", {
      price: 51, eps: 9.8, bookValue: 62, revenuePerShare: 140, dividend: 3.5,
      freeCashFlow: 720_000_000, ebit: 1_350_000_000, ebitda: 2_100_000_000,
      totalDebt: 1_800_000_000, cash: 1_500_000_000, equity: 6_200_000_000,
      roe: 0.16, epsGrowth: -0.2, revenueGrowth: -0.11,
    }),
    co("EXF", "Example Utilities", "Utilities", {
      price: 33, eps: 2.4, bookValue: 29, revenuePerShare: 41, dividend: 1.7,
      freeCashFlow: 90_000_000, ebit: 640_000_000, ebitda: 1_100_000_000,
      totalDebt: 4_200_000_000, cash: 300_000_000, equity: 2_900_000_000,
      roe: 0.083, epsGrowth: 0.02, revenueGrowth: 0.03,
    }),
    co("EXG", "Example Logistics", "Industrials", {
      price: 18.5, eps: 1.55, bookValue: 11.4, revenuePerShare: null, dividend: 0,
      freeCashFlow: null, ebit: 78_000_000, ebitda: 118_000_000,
      totalDebt: 210_000_000, cash: 95_000_000, equity: 640_000_000,
      roe: 0.14, epsGrowth: 0.09, revenueGrowth: null,
    }),
    co("EXH", "Example Consumer Brands", "Consumer", {
      price: 76, eps: 3.9, bookValue: 18, revenuePerShare: 55, dividend: 2.1,
      freeCashFlow: 400_000_000, ebit: 560_000_000, ebitda: 700_000_000,
      totalDebt: 900_000_000, cash: 250_000_000, equity: 1_800_000_000,
      roe: 0.21, epsGrowth: 0.07, revenueGrowth: 0.05,
    }),
  ];
}

/** The illustration, stamped with the week it is being looked at. */
export function sampleSnapshot(now: Date = new Date()): Snapshot {
  return {
    week: isoWeek(now),
    takenAt: now.toISOString(),
    source: "invented figures shipped with the app",
    sample: true,
    facts: sampleFacts(),
  };
}

export function sampleData(): Data {
  const { pots, purchases } = samplePots();
  return {
    ...emptyData(),
    items: sampleItems(),
    pots,
    purchases,
    opening: -1000,
    overdraft: 5000,
    sample: true,
    stocks: { ...emptyStockBook(), snapshots: [sampleSnapshot()] },
  };
}
