import {
  Car,
  Home,
  Landmark,
  Package,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { AssetKind, Data, Freq, Item, Kind } from "../types";
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
    opening: 0,
    overdraft: 0,
    odRate: 0,
    horizon: 12,
    sample: false,
    schemaVersion: SCHEMA_VERSION,
  };
}

/** Seed numbers so a first-time opener can see what the thing does. */
export function sampleItems(): Item[] {
  const T = nowIdx();
  return [
    { id: uid(), name: "Salary (net)", kind: "income", cat: "Salary", amount: 2400, freq: "monthly", first: toYM(T - 12), last: "" },
    { id: uid(), name: "Urlaubsgeld", kind: "income", cat: "Salary", amount: 1400, freq: "yearly", first: toYM(T - 12 + 5), last: "" },
    { id: uid(), name: "Weihnachtsgeld", kind: "income", cat: "Salary", amount: 1400, freq: "yearly", first: toYM(T - 12 + 10), last: "" },

    { id: uid(), name: "Miete + Betriebskosten", kind: "expense", cat: "Home", amount: 890, freq: "monthly", first: toYM(T - 12), last: "" },
    { id: uid(), name: "Groceries & household", kind: "expense", cat: "Food", amount: 420, freq: "monthly", first: toYM(T - 12), last: "" },
    { id: uid(), name: "Wien Energie", kind: "expense", cat: "Utilities", amount: 195, freq: "quarterly", first: toYM(T - 1), last: "" },
    { id: uid(), name: "Internet + mobile", kind: "expense", cat: "Phone & internet", amount: 45, freq: "monthly", first: toYM(T - 12), last: "" },
    { id: uid(), name: "ORF-Beitrag", kind: "expense", cat: "Subscriptions", amount: 46, freq: "quarterly", first: toYM(T), last: "" },
    { id: uid(), name: "Haushaltsversicherung", kind: "expense", cat: "Insurance", amount: 260, freq: "yearly", first: toYM(T + 1), last: "" },
    { id: uid(), name: "Jahreskarte Wiener Linien", kind: "expense", cat: "Transport", amount: 365, freq: "yearly", first: toYM(T + 5), last: "" },

    { id: uid(), name: "Laptop financing", kind: "expense", cat: "Debt & financing", amount: 49, freq: "monthly", first: toYM(T - 9), last: toYM(T + 2) },
    { id: uid(), name: "Loan (for fiancé)", kind: "expense", cat: "Debt & financing", amount: 320, freq: "monthly", first: toYM(T - 5), last: toYM(T + 31), reimb: { who: "Fiancé", amount: 320 } },
    { id: uid(), name: "Sister's phone financing", kind: "expense", cat: "Family", amount: 32, freq: "monthly", first: toYM(T - 3), last: toYM(T + 20), reimb: { who: "Sister", amount: 32 } },

    { id: uid(), name: "Wohnsparbuch", kind: "saving", cat: "Savings", amount: 100, freq: "monthly", first: toYM(T - 12), last: "" },
    { id: uid(), name: "Revolut — investing", kind: "saving", cat: "Investing", amount: 150, freq: "monthly", first: toYM(T - 12), last: "" },
  ];
}

export function sampleData(): Data {
  return {
    ...emptyData(),
    items: sampleItems(),
    opening: -1200,
    overdraft: 6000,
    sample: true,
  };
}
