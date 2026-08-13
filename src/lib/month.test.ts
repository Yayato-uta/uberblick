import { describe, expect, it } from "vitest";
import {
  countOccurrences,
  fromYM,
  longLabel,
  monthlyEquivalent,
  occursIn,
  toYM,
} from "./month";
import type { Freq } from "../types";

const sched = (first: string, freq: Freq, last = "") => ({ first, last, freq });

describe("month indices", () => {
  it("puts Aug 2026 at 2026*12 + 7", () => {
    expect(fromYM("2026-08")).toBe(2026 * 12 + 7);
  });

  it("round-trips", () => {
    for (const ym of ["2024-01", "2026-08", "2031-12"]) {
      expect(toYM(fromYM(ym)!)).toBe(ym);
    }
  });

  it("treats an empty or broken date as no date", () => {
    expect(fromYM("")).toBeNull();
    expect(fromYM(undefined)).toBeNull();
    expect(fromYM("nonsense")).toBeNull();
    expect(fromYM("2026-13")).toBeNull();
    expect(fromYM("2026-00")).toBeNull();
  });

  it("labels a month", () => {
    expect(longLabel(fromYM("2026-08")!)).toBe("Aug 2026");
  });
});

describe("occursIn", () => {
  const sep = fromYM("2026-09")!;

  it("never fires before the first payment", () => {
    expect(occursIn(sched("2026-09", "monthly"), sep - 1)).toBe(false);
    expect(occursIn(sched("2026-09", "monthly"), sep)).toBe(true);
  });

  it("anchors a quarterly bill on its first payment, not on January", () => {
    const bill = sched("2026-09", "quarterly");
    const hits = ["2026-09", "2026-12", "2027-03", "2027-06"];
    const misses = ["2026-10", "2026-11", "2027-01", "2027-02", "2027-04", "2027-05"];
    for (const ym of hits) expect(occursIn(bill, fromYM(ym)!), ym).toBe(true);
    for (const ym of misses) expect(occursIn(bill, fromYM(ym)!), ym).toBe(false);
  });

  it("handles six-monthly and yearly the same way", () => {
    const semi = sched("2026-09", "semiannual");
    expect(occursIn(semi, fromYM("2027-03")!)).toBe(true);
    expect(occursIn(semi, fromYM("2026-12")!)).toBe(false);

    const yearly = sched("2026-09", "yearly");
    expect(occursIn(yearly, fromYM("2027-09")!)).toBe(true);
    expect(occursIn(yearly, fromYM("2027-03")!)).toBe(false);
  });

  it("fires a one-off exactly once", () => {
    const once = sched("2026-09", "oneoff");
    expect(occursIn(once, sep)).toBe(true);
    expect(occursIn(once, sep + 1)).toBe(false);
  });

  it("stops after the last payment, inclusive", () => {
    const loan = sched("2026-01", "monthly", "2026-03");
    expect(occursIn(loan, fromYM("2026-03")!)).toBe(true);
    expect(occursIn(loan, fromYM("2026-04")!)).toBe(false);
  });

  it("counts occurrences over a window", () => {
    const q = sched("2026-09", "quarterly");
    expect(countOccurrences(q, fromYM("2026-09")!, fromYM("2027-08")!)).toBe(4);
  });
});

describe("monthlyEquivalent", () => {
  it("spreads a non-monthly amount", () => {
    expect(monthlyEquivalent(365, "yearly")).toBeCloseTo(365 / 12);
    expect(monthlyEquivalent(195, "quarterly")).toBeCloseTo(65);
    expect(monthlyEquivalent(120, "semiannual")).toBe(20);
    expect(monthlyEquivalent(50, "monthly")).toBe(50);
  });

  it("gives a one-off no monthly equivalent", () => {
    expect(monthlyEquivalent(900, "oneoff")).toBe(0);
  });
});
