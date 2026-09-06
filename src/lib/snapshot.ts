import type { Snapshot, StockBook, StockFacts } from "../types";
import { fileSnapshot, isoWeek } from "./valuation";

/* Reading a week's figures in from outside.
 *
 * Same posture as `migrate.ts`: a file that isn't recognisably a week of
 * figures is refused outright rather than half-imported, and a field that
 * cannot be read comes back null rather than zero — because on this screen
 * zero is a real answer. A company with no dividend and a company whose
 * dividend nobody published must not end up looking the same.
 *
 * The shape is deliberately loose about what it will accept. `tools/
 * fetch-fundamentals.mjs` writes the full object, but a bare array of
 * companies is taken too, so a list assembled by hand or by somebody else's
 * script imports without ceremony. */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v.trim() : v == null ? fallback : String(v).trim();

/**
 * A number, or null. Unlike the money fields elsewhere in the app this does
 * NOT fall back to zero: null means "not published", zero means "zero", and
 * the ranking treats them completely differently.
 */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  const n = Number(s.replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * A rate, as a fraction per year. Sources disagree about this one: some write
 * 18 for eighteen percent and some write 0.18, so anything of a magnitude
 * that could only have been meant as a percentage is divided down.
 */
function rate(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  return Math.abs(n) > 1.5 ? n / 100 : n;
}

/** "YYYY-Www", or "" if it isn't one. */
function normWeek(v: unknown): string {
  const m = /^(\d{4})-?[Ww](\d{1,2})$/.exec(str(v));
  if (!m) return "";
  const week = Number(m[2]);
  if (week < 1 || week > 53) return "";
  return `${m[1]}-W${String(week).padStart(2, "0")}`;
}

/**
 * One company. A row needs a ticker and a usable price to be worth keeping —
 * without a price there is no yield to rank and no gap to fair value, which
 * is the entire screen.
 */
export function normFacts(raw: unknown): StockFacts | null {
  if (!isObj(raw)) return null;
  const ticker = str(raw.ticker ?? raw.symbol).toUpperCase();
  const price = num(raw.price ?? raw.close);
  if (!ticker || price === null || price <= 0) return null;

  return {
    ticker,
    name: str(raw.name ?? raw.longName) || ticker,
    currency: str(raw.currency).toUpperCase() || "USD",
    sector: str(raw.sector) || "Unclassified",
    price,
    shares: num(raw.shares ?? raw.sharesOutstanding),
    eps: num(raw.eps ?? raw.trailingEps),
    bookValue: num(raw.bookValue ?? raw.bookValuePerShare),
    revenuePerShare: num(raw.revenuePerShare),
    dividend: num(raw.dividend ?? raw.dividendRate),
    freeCashFlow: num(raw.freeCashFlow),
    ebit: num(raw.ebit ?? raw.operatingIncome),
    ebitda: num(raw.ebitda),
    totalDebt: num(raw.totalDebt),
    cash: num(raw.cash ?? raw.totalCash),
    equity: num(raw.equity ?? raw.totalEquity),
    roe: rate(raw.roe ?? raw.returnOnEquity),
    epsGrowth: rate(raw.epsGrowth ?? raw.earningsGrowth),
    revenueGrowth: rate(raw.revenueGrowth),
  };
}

/**
 * Turn a parsed file into a week of figures, or null if it plainly isn't one.
 * The last row wins where a ticker appears twice, which is what re-running a
 * fetch over a corrected row is meant to do.
 */
export function readSnapshot(raw: unknown, now: Date = new Date()): Snapshot | null {
  const body = Array.isArray(raw) ? { facts: raw } : raw;
  if (!isObj(body)) return null;

  const list = Array.isArray(body.facts)
    ? body.facts
    : Array.isArray(body.stocks)
      ? body.stocks
      : null;
  if (!list) return null;

  const byTicker = new Map<string, StockFacts>();
  for (const row of list) {
    const f = normFacts(row);
    if (f) byTicker.set(f.ticker, f);
  }
  if (byTicker.size === 0) return null;

  const takenAt = str(body.takenAt);
  const stamped = takenAt && !Number.isNaN(Date.parse(takenAt)) ? takenAt : now.toISOString();

  return {
    // an undated file is this week's: it was fetched to be used now
    week: normWeek(body.week) || isoWeek(new Date(stamped)),
    takenAt: stamped,
    source: str(body.source) || "imported by hand",
    sample: body.sample === true,
    facts: [...byTicker.values()],
  };
}

/** A blank row to type over, when a company is being added by hand. */
export function blankFacts(): StockFacts {
  return {
    ticker: "",
    name: "",
    currency: "EUR",
    sector: "Unclassified",
    price: 0,
    shares: null,
    eps: null,
    bookValue: null,
    revenuePerShare: null,
    dividend: null,
    freeCashFlow: null,
    ebit: null,
    ebitda: null,
    totalDebt: null,
    cash: null,
    equity: null,
    roe: null,
    epsGrowth: null,
    revenueGrowth: null,
  };
}

const BY_HAND = "edited by hand";

/**
 * Put one company into the current week, replacing it if it is already there.
 *
 * The shipped illustration is never edited — a real company typed in beside
 * eight invented ones would be ranked against figures that mean nothing, so
 * the first hand-entered company clears the illustration and starts the week
 * properly. Weeks already gone by are left alone: they are the record of what
 * the screen said at the time, and rewriting them would make the movement
 * column a lie.
 */
export function putFacts(book: StockBook, facts: StockFacts, now: Date = new Date()): StockBook {
  const current = book.snapshots[0];
  const fresh = !current || current.sample;

  const next: Snapshot = fresh
    ? {
        week: isoWeek(now),
        takenAt: now.toISOString(),
        source: BY_HAND,
        sample: false,
        facts: [facts],
      }
    : {
        ...current,
        takenAt: now.toISOString(),
        source: current.source.includes(BY_HAND) ? current.source : `${current.source} · ${BY_HAND}`,
        facts: current.facts.some((f) => f.ticker === facts.ticker)
          ? current.facts.map((f) => (f.ticker === facts.ticker ? facts : f))
          : [...current.facts, facts],
      };

  // clearing the illustration means clearing every week of it, not just this one
  const kept = fresh ? book.snapshots.filter((s) => !s.sample) : book.snapshots;
  return { ...book, snapshots: fileSnapshot(kept, next) };
}

/** Take a company off the current week. Earlier weeks keep their record of it. */
export function dropFacts(book: StockBook, ticker: string): StockBook {
  const current = book.snapshots[0];
  if (!current) return book;
  const facts = current.facts.filter((f) => f.ticker !== ticker);
  if (facts.length === current.facts.length) return book;
  return {
    ...book,
    snapshots: [{ ...current, facts }, ...book.snapshots.slice(1)],
  };
}

/** Bring an imported week in, replacing that week and leaving the others. */
export function addWeek(book: StockBook, snapshot: Snapshot): StockBook {
  // a real week retires the illustration rather than being ranked beside it
  const kept = snapshot.sample ? book.snapshots : book.snapshots.filter((s) => !s.sample);
  return { ...book, snapshots: fileSnapshot(kept, snapshot) };
}
