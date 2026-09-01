import { describe, expect, it } from "vitest";
import type { Item } from "../types";
import { actualFor, amountIn, isItemPaid, touchesMonth } from "./actual";
import { fromYM } from "./month";

const M = (ym: string) => fromYM(ym)!;

const strom: Item = {
  id: "strom",
  name: "Strom & Gas",
  kind: "expense",
  cat: "Utilities",
  amount: 218,
  freq: "quarterly",
  first: "2026-01",
  last: "",
};

describe("what a line actually did", () => {
  it("uses the usual amount when nothing was recorded", () => {
    expect(amountIn(strom, M("2026-01"))).toBe(218);
    expect(amountIn(strom, M("2026-02"))).toBe(0);
    expect(actualFor(strom, M("2026-01"))).toBeNull();
  });

  it("uses the recorded amount instead, for that month only", () => {
    const it0: Item = { ...strom, actuals: [{ month: "2026-04", amount: 265.5 }] };
    expect(amountIn(it0, M("2026-01"))).toBe(218);
    expect(amountIn(it0, M("2026-04"))).toBe(265.5);
    expect(amountIn(it0, M("2026-07"))).toBe(218);
  });

  it("records a month the bill was skipped", () => {
    const it0: Item = { ...strom, actuals: [{ month: "2026-04", amount: 0 }] };
    expect(amountIn(it0, M("2026-04"))).toBe(0);
    // still a month the line touches, so it stays visible rather than vanishing
    expect(touchesMonth(it0, M("2026-04"))).toBe(true);
  });

  it("counts a month the schedule never asked for, if money went out anyway", () => {
    const it0: Item = { ...strom, actuals: [{ month: "2026-02", amount: 90 }] };
    expect(touchesMonth(it0, M("2026-02"))).toBe(true);
    expect(amountIn(it0, M("2026-02"))).toBe(90);
  });

  it("ticks a month off without moving a figure", () => {
    const it0: Item = { ...strom, paid: ["2026-01"] };
    expect(isItemPaid(it0, M("2026-01"))).toBe(true);
    expect(isItemPaid(it0, M("2026-04"))).toBe(false);
    expect(amountIn(it0, M("2026-01"))).toBe(218);
  });
});
