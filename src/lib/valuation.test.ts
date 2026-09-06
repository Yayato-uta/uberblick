import { describe, expect, it } from "vitest";
import type { Assumptions, StockFacts } from "../types";
import {
  DEFAULT_ASSUMPTIONS,
  KEEP_WEEKS,
  dcfValue,
  earningsPowerValue,
  fairValue,
  fileSnapshot,
  grahamNumber,
  isoWeek,
  movement,
  percentiles,
  ratios,
  safetyScore,
  screen,
} from "./valuation";

const A: Assumptions = DEFAULT_ASSUMPTIONS;

/** A plain, profitable, unremarkable company. */
const base: StockFacts = {
  ticker: "AAA",
  name: "Alpha",
  currency: "EUR",
  sector: "Industrials",
  price: 100,
  shares: 1000,
  eps: 10,
  bookValue: 50,
  revenuePerShare: 200,
  dividend: 3,
  freeCashFlow: 9000,
  ebit: 12000,
  ebitda: 15000,
  totalDebt: 20000,
  cash: 5000,
  equity: 50000,
  roe: 0.2,
  epsGrowth: 0.06,
  revenueGrowth: 0.04,
};

const co = (over: Partial<StockFacts>): StockFacts => ({ ...base, ...over });

describe("ratios one company at a time", () => {
  const r = ratios(base);

  it("prices the whole business, not just the shares", () => {
    expect(r.marketCap).toBe(100_000);
    // market cap + debt − cash
    expect(r.enterpriseValue).toBe(115_000);
  });

  it("turns every multiple into a yield, so bigger is always cheaper", () => {
    expect(r.earningsYield).toBeCloseTo(0.1, 10);
    expect(r.bookYield).toBeCloseTo(0.5, 10);
    expect(r.salesYield).toBeCloseTo(2, 10);
    expect(r.fcfYield).toBeCloseTo(0.09, 10);
    expect(r.dividendYield).toBeCloseTo(0.03, 10);
    expect(r.ebitToEv).toBeCloseTo(12_000 / 115_000, 10);
  });

  it("measures return on the capital actually employed", () => {
    // 50000 equity + 20000 debt − 5000 cash
    expect(r.roce).toBeCloseTo(12_000 / 65_000, 10);
  });

  it("reads net cash as no leverage rather than as negative leverage", () => {
    expect(ratios(co({ cash: 100_000 })).leverage).toBe(0);
    expect(ratios(co({ cash: 100_000 })).solvency).toBe(1);
  });

  it("scores solvency so that three times EBITDA is a quarter as good as none", () => {
    const r3 = ratios(co({ totalDebt: 50_000, cash: 5_000 })); // net debt 45000 = 3× EBITDA
    expect(r3.leverage).toBeCloseTo(3, 10);
    expect(r3.solvency).toBeCloseTo(0.25, 10);
  });

  it("returns null, never zero, where the figures are missing", () => {
    const blind = ratios(co({ eps: null, shares: null, totalDebt: null }));
    expect(blind.earningsYield).toBeNull();
    expect(blind.marketCap).toBeNull();
    expect(blind.enterpriseValue).toBeNull();
    expect(blind.fcfYield).toBeNull();
  });

  it("refuses to divide by a price of zero", () => {
    expect(ratios(co({ price: 0 })).earningsYield).toBeNull();
  });
});

describe("what a share is worth", () => {
  it("uses Graham's 15 times earnings and 1.5 times book at once", () => {
    expect(grahamNumber(10, 50)).toBeCloseTo(Math.sqrt(22.5 * 500), 10);
  });

  it("has no opinion on a company that loses money", () => {
    expect(grahamNumber(-1, 50)).toBeNull();
    expect(grahamNumber(10, -5)).toBeNull();
    expect(earningsPowerValue(-1, 9)).toBeNull();
  });

  it("values flat earnings as a perpetuity at the required return", () => {
    expect(earningsPowerValue(9, 9)).toBeCloseTo(100, 10);
  });

  it("wants more of a business the less it is asked to return", () => {
    const cheapMoney = dcfValue(9, 0.06, { ...A, requiredReturn: 6 })!;
    const dearMoney = dcfValue(9, 0.06, { ...A, requiredReturn: 12 })!;
    expect(cheapMoney).toBeGreaterThan(dearMoney);
  });

  it("caps growth however good the past looked", () => {
    const fast = dcfValue(9, 0.5, A);
    const capped = dcfValue(9, A.growthCap / 100, A);
    expect(fast).toBeCloseTo(capped!, 10);
  });

  it("floors growth at zero rather than shrinking a company to nothing", () => {
    expect(dcfValue(9, -0.4, A)).toBeCloseTo(dcfValue(9, 0, A)!, 10);
  });

  it("refuses a perpetuity that grows faster than money is discounted", () => {
    expect(dcfValue(9, 0.05, { ...A, requiredReturn: 2, terminalGrowth: 2.5 })).toBeNull();
  });

  it("has nothing to say about a company burning cash", () => {
    expect(dcfValue(-4, 0.05, A)).toBeNull();
  });

  it("blends only the models that could run, and counts them", () => {
    const f = co({ freeCashFlow: null });
    const v = fairValue(f, ratios(f), A);
    expect(v.discountedCashFlow).toBeNull();
    expect(v.models).toBe(2);
    expect(v.blended).toBeCloseTo((v.graham! + v.earningsPower!) / 2, 10);
  });

  it("gives up entirely on a loss-making, cash-burning company", () => {
    const f = co({ eps: -2, freeCashFlow: -1000 });
    const v = fairValue(f, ratios(f), A);
    expect(v.models).toBe(0);
    expect(v.blended).toBeNull();
    expect(v.marginOfSafety).toBeNull();
  });

  it("measures the margin of safety off the value, not off the price", () => {
    const f = co({});
    const v = fairValue(f, ratios(f), A);
    expect(v.marginOfSafety).toBeCloseTo((v.blended! - 100) / v.blended!, 10);
  });
});

describe("the margin of safety on a 0-100 scale", () => {
  it("scores a share priced at exactly fair value in the middle", () => {
    expect(safetyScore(0)).toBe(50);
  });

  it("scores half price at the top and twice the value at the bottom", () => {
    expect(safetyScore(0.5)).toBe(100);
    expect(safetyScore(-0.5)).toBe(0);
    // and does not run off the end
    expect(safetyScore(9)).toBe(100);
    expect(safetyScore(-9)).toBe(0);
  });

  it("has no opinion where no model could run", () => {
    expect(safetyScore(null)).toBe(50);
  });
});

describe("ranking across a list", () => {
  it("puts the biggest last and spreads the rest between", () => {
    expect(percentiles([1, 2, 3])).toEqual([0, 50, 100]);
  });

  it("gives tied figures the same place rather than an arbitrary order", () => {
    const p = percentiles([5, 5, 5, 9]);
    // the three fives share places 0, 1 and 2, so all three get place 1 of 3
    expect(p[0]).toBeCloseTo(100 / 3, 10);
    expect(p[1]).toBe(p[0]);
    expect(p[2]).toBe(p[0]);
    expect(p[3]).toBe(100);
  });

  it("leaves a missing figure unranked instead of ranking it bottom", () => {
    expect(percentiles([1, null, 3])).toEqual([0, null, 100]);
  });

  it("calls a single company neither top nor bottom of anything", () => {
    expect(percentiles([7])).toEqual([50]);
    expect(percentiles([null])).toEqual([null]);
  });
});

describe("the weekly screen", () => {
  it("puts the cheaper of two identical businesses first", () => {
    const rows = screen([co({ ticker: "DEAR", price: 200 }), co({ ticker: "CHEAP", price: 50 })], A);
    expect(rows[0].facts.ticker).toBe("CHEAP");
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
    expect(rows[0].score).toBeGreaterThan(rows[1].score);
  });

  it("discounts a cheap company for being a poor business", () => {
    const good = co({ ticker: "GOOD" });
    const weak = co({
      ticker: "WEAK",
      ebit: 500,
      ebitda: 800,
      roe: 0.01,
      epsGrowth: -0.1,
      revenueGrowth: -0.08,
      totalDebt: 60_000,
    });
    const rows = screen([good, weak], A);
    const w = rows.find((r) => r.facts.ticker === "WEAK")!;
    const g = rows.find((r) => r.facts.ticker === "GOOD")!;
    expect(w.qualityScore).toBeLessThan(g.qualityScore);
    // quality takes away from a score, it never adds
    expect(w.score).toBeLessThanOrEqual(0.5 * w.safetyScore + 0.5 * w.valueScore);
  });

  it("never discounts a score to nothing on quality alone", () => {
    const rows = screen([co({ ticker: "A" }), co({ ticker: "B", price: 20 })], A);
    for (const r of rows) {
      expect(r.score).toBeGreaterThanOrEqual(0.6 * (0.5 * r.safetyScore + 0.5 * r.valueScore) - 1e-9);
    }
  });

  it("says outright when a company is failing", () => {
    const failing = co({
      ticker: "GONE",
      price: 20,
      eps: -3,
      freeCashFlow: -4000,
      ebit: -500,
      ebitda: 200,
      revenueGrowth: -0.2,
      totalDebt: 80_000,
    });
    const [row] = screen([failing], A);
    expect(row.flags).toContain("Loses money");
    expect(row.flags).toContain("Burns cash");
    expect(row.flags).toContain("Revenue is shrinking");
    expect(row.flags.some((f) => f.includes("EBITDA"))).toBe(true);
  });

  /* The dangerous case is not the company that is obviously dying — it is the
     one that still turns a profit and screens as the cheapest thing on the
     list while earning nothing on a mountain of borrowed capital. */
  it("calls out the company that is cheap on every yield and weak underneath", () => {
    const trap = co({
      ticker: "TRAP",
      price: 20,
      eps: 3,
      bookValue: 80,
      revenuePerShare: 400,
      freeCashFlow: 5_000,
      ebit: 4_000,
      ebitda: 5_000,
      totalDebt: 90_000,
      cash: 1_000,
      equity: 80_000,
      roe: 0.01,
      epsGrowth: -0.15,
      revenueGrowth: -0.1,
    });
    const rows = screen([trap, co({ ticker: "OK" }), co({ ticker: "OK2", price: 130 })], A);
    const t = rows.find((r) => r.facts.ticker === "TRAP")!;
    expect(t.valueScore).toBeGreaterThan(65);
    expect(t.qualityScore).toBeLessThan(35);
    expect(t.flags).toContain("Cheap and weak — the classic value trap");
    // it still turns a profit, so it is not accused of losing money
    expect(t.flags).not.toContain("Loses money");
  });

  it("judges a company on the figures it has rather than on the ones it lacks", () => {
    // no book value published: the other four yields still decide its place
    const partial = co({ ticker: "PART", bookValue: null });
    const rows = screen([partial, co({ ticker: "FULL" })], A);
    const p = rows.find((r) => r.facts.ticker === "PART")!;
    expect(p.valueParts.bookYield).toBeNull();
    expect(p.valueScore).toBeGreaterThan(0);
    expect(Number.isFinite(p.score)).toBe(true);
  });

  it("has no opinion at all about a company with nothing published", () => {
    const blank: StockFacts = {
      ...co({ ticker: "NULL" }),
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
    const [row] = screen([blank], A);
    expect(row.valueScore).toBe(50);
    expect(row.qualityScore).toBe(50);
    expect(row.safetyScore).toBe(50);
    expect(row.flags).toContain("No model could value it on these figures");
  });

  it("ranks an empty watchlist without complaint", () => {
    expect(screen([], A)).toEqual([]);
  });
});

describe("what moved since last week", () => {
  const thisWeek = screen([co({ ticker: "AAA", price: 90 }), co({ ticker: "BBB", price: 120 })], A);
  const lastWeek = screen([co({ ticker: "AAA", price: 150 }), co({ ticker: "BBB", price: 100 })], A);
  const moves = movement(thisWeek, lastWeek);

  it("counts places gained as positive", () => {
    // AAA was the dearer of the two last week and is the cheaper now
    expect(moves.get("AAA")!.wasRank).toBe(2);
    expect(moves.get("AAA")!.moved).toBe(1);
    expect(moves.get("BBB")!.moved).toBe(-1);
  });

  it("measures the price change off last week's price", () => {
    expect(moves.get("AAA")!.priceChange).toBeCloseTo((90 - 150) / 150, 10);
  });

  it("marks a name that wasn't there last week as new", () => {
    const withNew = screen([co({ ticker: "NEW" })], A);
    expect(movement(withNew, lastWeek).get("NEW")).toEqual({
      wasRank: null,
      moved: null,
      priceChange: null,
    });
  });
});

describe("weeks", () => {
  it("dates a week by the Thursday inside it", () => {
    // 2026-01-01 is a Thursday, so that week is 2026-W01
    expect(isoWeek(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
    // the Sunday before still belongs to the week whose Thursday is in 2025
    expect(isoWeek(new Date("2025-12-28T12:00:00Z"))).toBe("2025-W52");
    expect(isoWeek(new Date("2026-09-06T12:00:00Z"))).toBe("2026-W36");
  });

  const snap = (week: string) => ({
    week,
    takenAt: "2026-09-06T00:00:00.000Z",
    source: "test",
    sample: false,
    facts: [] as StockFacts[],
  });

  it("keeps the newest week first", () => {
    const book = fileSnapshot([snap("2026-W34")], snap("2026-W35"));
    expect(book.map((s) => s.week)).toEqual(["2026-W35", "2026-W34"]);
  });

  it("corrects a week rather than storing it twice", () => {
    const book = fileSnapshot([snap("2026-W35"), snap("2026-W34")], {
      ...snap("2026-W35"),
      source: "corrected",
    });
    expect(book).toHaveLength(2);
    expect(book[0].source).toBe("corrected");
  });

  it("forgets weeks past the ones worth keeping", () => {
    let book = [snap("2026-W01")];
    for (let w = 2; w <= KEEP_WEEKS + 4; w++) {
      book = fileSnapshot(book, snap(`2026-W${String(w).padStart(2, "0")}`));
    }
    expect(book).toHaveLength(KEEP_WEEKS);
    expect(book[0].week).toBe(`2026-W${KEEP_WEEKS + 4}`);
  });
});
