import {
  Car,
  Home,
  Landmark,
  Package,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { AssetKind, Data, Freq, Item, Kind, Pot, PotKind, Purchase } from "../types";
import { nowIdx, toYM } from "./month";
import { uid } from "./format";
import { LIGHT, type Palette } from "./palette";

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

export const SCHEMA_VERSION = 1;

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
    schemaVersion: SCHEMA_VERSION,
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
  };
}
