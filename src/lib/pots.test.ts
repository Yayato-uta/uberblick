import { describe, expect, it } from "vitest";
import type { Pot, Purchase } from "../types";
import { allocatedIn, balanceAt, fundedIn, potMonth, purchasesIn, spentIn } from "./pots";
import { fromYM } from "./month";

const M = (ym: string) => fromYM(ym)!;

const food: Pot = {
  id: "food",
  name: "Food",
  kind: "spending",
  monthly: 300,
  balance: 0,
  first: "2026-08",
  last: "",
};

const buy = (date: string, amount: number, note = ""): Purchase => ({
  id: date + amount,
  potId: "food",
  date,
  note,
  amount,
});

describe("what goes into a pot", () => {
  it("starts in its first funded month and not before", () => {
    expect(fundedIn(food, M("2026-07"))).toBe(false);
    expect(fundedIn(food, M("2026-08"))).toBe(true);
    expect(allocatedIn(food, M("2026-07"))).toBe(0);
    expect(allocatedIn(food, M("2026-08"))).toBe(300);
  });

  it("stops after the last funded month", () => {
    const ending: Pot = { ...food, last: "2026-10" };
    expect(allocatedIn(ending, M("2026-10"))).toBe(300);
    expect(allocatedIn(ending, M("2026-11"))).toBe(0);
  });
});

describe("carrying the leftover forward", () => {
  /* The whole point: spend 260 of 300 in August and September starts with 340
     to play with, not 300. */
  const purchases = [buy("2026-08-03", 60), buy("2026-08-17", 120), buy("2026-08-28", 80)];

  it("counts what was spent in the month", () => {
    expect(spentIn(food, purchases, M("2026-08"))).toBe(260);
    expect(spentIn(food, purchases, M("2026-09"))).toBe(0);
  });

  it("leaves the unspent part in the pot", () => {
    expect(balanceAt(food, purchases, M("2026-08"))).toBe(40);
  });

  it("hands it to the next month on top of the new allocation", () => {
    const sep = potMonth(food, purchases, M("2026-09"));
    expect(sep.carriedIn).toBe(40);
    expect(sep.allocated).toBe(300);
    expect(sep.available).toBe(340);
    expect(sep.spent).toBe(0);
    expect(sep.left).toBe(340);
  });

  it("keeps piling up across a quiet run of months", () => {
    // Aug leaves 40, then Sep–Dec are four untouched months at 300 each
    expect(balanceAt(food, purchases, M("2026-12"))).toBe(40 + 1200);
  });
});

describe("a month where you overspend", () => {
  const purchases = [buy("2026-08-03", 500)];

  it("goes negative rather than quietly clamping at zero", () => {
    const aug = potMonth(food, purchases, M("2026-08"));
    expect(aug.spent).toBe(500);
    expect(aug.left).toBe(-200);
    expect(aug.over).toBe(true);
    expect(aug.usedPct).toBe(100);
  });

  it("takes the overspend out of the next month's money", () => {
    const sep = potMonth(food, purchases, M("2026-09"));
    expect(sep.carriedIn).toBe(-200);
    expect(sep.available).toBe(100);
    expect(sep.left).toBe(100);
  });
});

describe("what was already in the pot", () => {
  it("is there from the first month", () => {
    const seeded: Pot = { ...food, balance: 75 };
    const aug = potMonth(seeded, [], M("2026-08"));
    expect(aug.carriedIn).toBe(75);
    expect(aug.available).toBe(375);
  });
});

describe("the purchase list", () => {
  const purchases = [
    buy("2026-08-03", 60, "Billa"),
    buy("2026-09-01", 25, "next month"),
    buy("2026-08-28", 80, "Hofer"),
    { ...buy("2026-08-10", 10, "other pot"), potId: "petrol" },
  ];

  it("shows only this pot, only this month, newest first", () => {
    const rows = purchasesIn(food, purchases, M("2026-08"));
    expect(rows.map((r) => r.note)).toEqual(["Hofer", "Billa"]);
  });
});

describe("a pot nobody has touched", () => {
  it("reports its full allocation as still there", () => {
    const aug = potMonth(food, [], M("2026-08"));
    expect(aug.left).toBe(300);
    expect(aug.usedPct).toBe(0);
    expect(aug.over).toBe(false);
  });

  it("says so plainly in a month it isn't funded", () => {
    const before = potMonth(food, [], M("2026-06"));
    expect(before.funded).toBe(false);
    expect(before.allocated).toBe(0);
    expect(before.left).toBe(0);
  });
});
