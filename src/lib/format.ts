const cache = new Map<string, Intl.NumberFormat>();

function fmt(dp: number, currency: string): Intl.NumberFormat {
  const key = `${currency}:${dp}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("de-AT", {
      style: "currency",
      currency,
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    });
    cache.set(key, f);
  }
  return f;
}

/** Euro, de-AT, no decimals unless asked for. */
export const eur = (n: number, dp = 0): string => fmt(dp, "EUR").format(Number.isFinite(n) ? n : 0);

/**
 * The same, in somebody else's currency. Only the stock screen needs this:
 * a share price is quoted in whatever the exchange trades in, and converting
 * it to euro at a rate nobody recorded would be inventing a figure. An
 * unrecognised code falls back to printing the code beside the number rather
 * than throwing.
 */
export function money(n: number, currency: string, dp = 2): string {
  const v = Number.isFinite(n) ? n : 0;
  try {
    return fmt(dp, currency || "EUR").format(v);
  } catch {
    return `${v.toFixed(dp).replace(".", ",")} ${currency}`;
  }
}

/** A fraction as a percentage: 0.134 -> "13,4%". Null stays a dash. */
export const asPct = (n: number | null, dp = 1): string =>
  n === null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(dp).replace(".", ",")}%`;

/** The same, with a sign always shown — for a change rather than a level. */
export const asDelta = (n: number | null, dp = 1): string =>
  n === null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${asPct(n, dp)}`;

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
