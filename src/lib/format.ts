const cache = new Map<number, Intl.NumberFormat>();

function fmt(dp: number): Intl.NumberFormat {
  let f = cache.get(dp);
  if (!f) {
    f = new Intl.NumberFormat("de-AT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    });
    cache.set(dp, f);
  }
  return f;
}

/** Euro, de-AT, no decimals unless asked for. */
export const eur = (n: number, dp = 0): string => fmt(dp).format(Number.isFinite(n) ? n : 0);

/** Compact axis labels: 1.2k, -6k. */
export const eurAxis = (n: number): string => {
  if (Math.abs(n) >= 1000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n));
};

export const pct = (n: number, dp = 0): string =>
  `${(Number.isFinite(n) ? n : 0).toFixed(dp).replace(".", ",")}%`;

export const uid = (): string =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

/** Accepts "1.234,56", "1234.56", "-12", "" — the way people actually type. */
export function parseNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s || s === "-") return 0;
  // strip thousands separators, then normalise the decimal comma
  const cleaned = s.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Same, but never negative — amounts are always stored positive. */
export const parsePos = (v: unknown): number => Math.abs(parseNum(v));
