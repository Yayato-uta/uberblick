import { describe, expect, it } from "vitest";
import { addWeek, blankFacts, dropFacts, normFacts, putFacts, readSnapshot } from "./snapshot";
import { emptyStockBook } from "./constants";
import type { Snapshot, StockBook, StockFacts } from "../types";

const NOW = new Date("2026-09-06T10:00:00.000Z"); // a Sunday in ISO week 36

const row = (over: Record<string, unknown> = {}) => ({
  ticker: "aapl",
  name: "Apple",
  currency: "usd",
  price: 100,
  ...over,
});

describe("reading one company", () => {
  it("needs a ticker and a price and nothing else", () => {
    const f = normFacts({ ticker: "MSFT", price: 300 })!;
    expect(f.ticker).toBe("MSFT");
    expect(f.price).toBe(300);
    expect(f.eps).toBeNull();
  });

  it("refuses a row with no price to rank", () => {
    expect(normFacts({ ticker: "X" })).toBeNull();
    expect(normFacts({ ticker: "X", price: 0 })).toBeNull();
    expect(normFacts({ ticker: "X", price: -4 })).toBeNull();
    expect(normFacts({ price: 10 })).toBeNull();
    expect(normFacts("AAPL")).toBeNull();
  });

  it("normalises the ticker and the currency the way a filing writes them", () => {
    const f = normFacts(row())!;
    expect(f.ticker).toBe("AAPL");
    expect(f.currency).toBe("USD");
  });

  it("names a company after its ticker when it has no name", () => {
    expect(normFacts({ ticker: "ZZZ", price: 5 })!.name).toBe("ZZZ");
  });

  /* Zero and unpublished must not collapse into each other: one company pays
     no dividend, the other has one nobody could find, and only the second
     should sit out the ranking. */
  it("keeps a real zero apart from a figure nobody published", () => {
    expect(normFacts(row({ dividend: 0 }))!.dividend).toBe(0);
    expect(normFacts(row({ dividend: null }))!.dividend).toBeNull();
    expect(normFacts(row({}))!.dividend).toBeNull();
    expect(normFacts(row({ dividend: "n/a" }))!.dividend).toBeNull();
  });

  it("takes the field names the common sources actually use", () => {
    const f = normFacts({
      symbol: "OMV.VI",
      longName: "OMV AG",
      close: 40,
      trailingEps: 5,
      sharesOutstanding: 327_000_000,
      totalCash: 4_000_000_000,
      returnOnEquity: 0.11,
      operatingIncome: 2_000_000_000,
    })!;
    expect(f.ticker).toBe("OMV.VI");
    expect(f.name).toBe("OMV AG");
    expect(f.price).toBe(40);
    expect(f.eps).toBe(5);
    expect(f.shares).toBe(327_000_000);
    expect(f.cash).toBe(4_000_000_000);
    expect(f.roe).toBeCloseTo(0.11, 10);
    expect(f.ebit).toBe(2_000_000_000);
  });

  it("reads numbers however they were written down", () => {
    expect(normFacts(row({ price: "1,234.50" }))!.price).toBeCloseTo(1234.5, 10);
    expect(normFacts(row({ shares: " 1 000 " }))!.shares).toBe(1000);
  });

  /* Sources disagree: some write 18 for eighteen percent, some write 0.18. */
  it("reads a rate as a fraction whichever way the source meant it", () => {
    expect(normFacts(row({ roe: 18 }))!.roe).toBeCloseTo(0.18, 10);
    expect(normFacts(row({ roe: 0.18 }))!.roe).toBeCloseTo(0.18, 10);
    expect(normFacts(row({ revenueGrowth: -12 }))!.revenueGrowth).toBeCloseTo(-0.12, 10);
    // a genuinely enormous growth rate is the one casualty, and 150% is rare
    expect(normFacts(row({ epsGrowth: 1.2 }))!.epsGrowth).toBeCloseTo(1.2, 10);
  });
});

describe("reading a week of figures", () => {
  it("takes the file the fetch script writes", () => {
    const s = readSnapshot(
      {
        week: "2026-W35",
        takenAt: "2026-08-31T06:00:00.000Z",
        source: "fetch-fundamentals",
        facts: [row(), row({ ticker: "MSFT", price: 300 })],
      },
      NOW,
    )!;
    expect(s.week).toBe("2026-W35");
    expect(s.source).toBe("fetch-fundamentals");
    expect(s.facts.map((f) => f.ticker)).toEqual(["AAPL", "MSFT"]);
    expect(s.sample).toBe(false);
  });

  it("takes a bare list of companies too", () => {
    const s = readSnapshot([row()], NOW)!;
    expect(s.facts).toHaveLength(1);
    expect(s.week).toBe("2026-W36");
    expect(s.takenAt).toBe(NOW.toISOString());
  });

  it("dates an undated file by when it was fetched, not by when it is read", () => {
    const s = readSnapshot({ takenAt: "2026-01-02T00:00:00.000Z", facts: [row()] }, NOW)!;
    expect(s.week).toBe("2026-W01");
  });

  it("pads a sloppily written week", () => {
    expect(readSnapshot({ week: "2026-w7", facts: [row()] }, NOW)!.week).toBe("2026-W07");
  });

  it("ignores a week that isn't one", () => {
    expect(readSnapshot({ week: "2026-W99", facts: [row()] }, NOW)!.week).toBe("2026-W36");
    expect(readSnapshot({ week: "last tuesday", facts: [row()] }, NOW)!.week).toBe("2026-W36");
  });

  it("lets a corrected row replace the one before it", () => {
    const s = readSnapshot([row({ price: 100 }), row({ price: 111 })], NOW)!;
    expect(s.facts).toHaveLength(1);
    expect(s.facts[0].price).toBe(111);
  });

  it("keeps the good rows and drops the unusable ones", () => {
    const s = readSnapshot([row(), { ticker: "BROKEN" }, null, 7], NOW)!;
    expect(s.facts.map((f) => f.ticker)).toEqual(["AAPL"]);
  });

  it("refuses anything that isn't a week of figures", () => {
    expect(readSnapshot(null, NOW)).toBeNull();
    expect(readSnapshot({ items: [] }, NOW)).toBeNull();
    expect(readSnapshot({ facts: "AAPL" }, NOW)).toBeNull();
    expect(readSnapshot([], NOW)).toBeNull();
    // a plan, not a screen — importing one over the other must not half-work
    expect(readSnapshot({ facts: [{ name: "Rent", amount: 900 }] }, NOW)).toBeNull();
  });

  it("carries the sample flag through so an illustration stays labelled", () => {
    expect(readSnapshot({ sample: true, facts: [row()] }, NOW)!.sample).toBe(true);
  });
});

describe("a company added by hand", () => {
  it("starts with nothing published rather than with zeroes", () => {
    const f = blankFacts();
    expect(f.eps).toBeNull();
    expect(f.freeCashFlow).toBeNull();
    expect(f.price).toBe(0);
  });
});

describe("keeping the book of weeks", () => {
  const facts = (ticker: string, price = 10): StockFacts => ({
    ...blankFacts(),
    ticker,
    name: ticker,
    price,
  });

  const snap = (week: string, tickers: string[], sample = false): Snapshot => ({
    week,
    takenAt: "2026-09-01T00:00:00.000Z",
    source: "test",
    sample,
    facts: tickers.map((t) => facts(t)),
  });

  const bookOf = (...snapshots: Snapshot[]): StockBook => ({ ...emptyStockBook(), snapshots });

  it("starts a week when there is none", () => {
    const b = putFacts(emptyStockBook(), facts("OMV.VI"), NOW);
    expect(b.snapshots).toHaveLength(1);
    expect(b.snapshots[0].week).toBe("2026-W36");
    expect(b.snapshots[0].facts.map((f) => f.ticker)).toEqual(["OMV.VI"]);
  });

  it("adds to the week already open", () => {
    const b = putFacts(bookOf(snap("2026-W36", ["AAA"])), facts("BBB"), NOW);
    expect(b.snapshots).toHaveLength(1);
    expect(b.snapshots[0].facts.map((f) => f.ticker)).toEqual(["AAA", "BBB"]);
  });

  it("replaces a company rather than listing it twice", () => {
    const b = putFacts(bookOf(snap("2026-W36", ["AAA"])), facts("AAA", 99), NOW);
    expect(b.snapshots[0].facts).toHaveLength(1);
    expect(b.snapshots[0].facts[0].price).toBe(99);
  });

  it("says once that a week has been edited by hand", () => {
    let b = putFacts(bookOf(snap("2026-W36", ["AAA"])), facts("BBB"), NOW);
    b = putFacts(b, facts("CCC"), NOW);
    expect(b.snapshots[0].source).toBe("test · edited by hand");
  });

  /* Ranking a real company against eight invented ones would produce a
     percentile that means nothing at all. */
  it("clears the shipped illustration the moment a real company arrives", () => {
    const b = putFacts(bookOf(snap("2026-W36", ["EXA", "EXB"], true)), facts("OMV.VI"), NOW);
    expect(b.snapshots).toHaveLength(1);
    expect(b.snapshots[0].sample).toBe(false);
    expect(b.snapshots[0].facts.map((f) => f.ticker)).toEqual(["OMV.VI"]);
  });

  it("clears an imported week of it too, not just the week on screen", () => {
    const b = addWeek(bookOf(snap("2026-W35", ["EXA"], true)), snap("2026-W36", ["OMV.VI"]));
    expect(b.snapshots).toHaveLength(1);
    expect(b.snapshots[0].facts.map((f) => f.ticker)).toEqual(["OMV.VI"]);
  });

  it("keeps the weeks that came before a real import", () => {
    const b = addWeek(bookOf(snap("2026-W35", ["AAA"])), snap("2026-W36", ["AAA", "BBB"]));
    expect(b.snapshots.map((s) => s.week)).toEqual(["2026-W36", "2026-W35"]);
  });

  it("corrects a week rather than adding a second copy of it", () => {
    const b = addWeek(bookOf(snap("2026-W36", ["AAA"])), snap("2026-W36", ["AAA", "BBB"]));
    expect(b.snapshots).toHaveLength(1);
    expect(b.snapshots[0].facts).toHaveLength(2);
  });

  it("takes a company off the current week", () => {
    const b = dropFacts(bookOf(snap("2026-W36", ["AAA", "BBB"])), "AAA");
    expect(b.snapshots[0].facts.map((f) => f.ticker)).toEqual(["BBB"]);
  });

  /* Earlier weeks are the record of what the screen said at the time. Editing
     them would make the "was #4 last week" column say something untrue. */
  it("leaves earlier weeks exactly as they were", () => {
    const b = dropFacts(bookOf(snap("2026-W36", ["AAA"]), snap("2026-W35", ["AAA"])), "AAA");
    expect(b.snapshots[0].facts).toHaveLength(0);
    expect(b.snapshots[1].facts.map((f) => f.ticker)).toEqual(["AAA"]);
  });

  it("shrugs at removing something that isn't there", () => {
    const before = bookOf(snap("2026-W36", ["AAA"]));
    expect(dropFacts(before, "ZZZ")).toBe(before);
    expect(dropFacts(emptyStockBook(), "AAA").snapshots).toHaveLength(0);
  });
});
