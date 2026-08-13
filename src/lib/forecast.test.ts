import { describe, expect, it } from "vitest";
import type { Item } from "../types";
import { avgOf, forecast } from "./forecast";
import { fromYM } from "./month";

const START = fromYM("2026-08")!;

const item = (over: Partial<Item> & Pick<Item, "name" | "kind" | "amount">): Item => ({
  id: over.name,
  cat: "Other",
  freq: "monthly",
  first: "2026-08",
  last: "",
  ...over,
});

describe("forecast", () => {
  it("carries the balance forward month by month", () => {
    const rows = forecast({
      items: [
        item({ name: "Salary", kind: "income", amount: 2000 }),
        item({ name: "Rent", kind: "expense", amount: 900 }),
        item({ name: "Sparbuch", kind: "saving", amount: 100 }),
      ],
      opening: 500,
      odRate: 0,
      horizon: 3,
      start: START,
    });

    expect(rows).toHaveLength(3);
    expect(rows[0].net).toBe(1000);
    expect(rows[0].balance).toBe(1500);
    expect(rows[2].balance).toBe(3500);
  });

  it("counts a reimbursement as money in, not as a smaller expense", () => {
    const [m] = forecast({
      items: [
        item({
          name: "Loan for fiancé",
          kind: "expense",
          amount: 320,
          reimb: { who: "Fiancé", amount: 320 },
        }),
      ],
      opening: 0,
      odRate: 0,
      horizon: 1,
      start: START,
    });

    // it still leaves the account…
    expect(m.expense).toBe(320);
    expect(m.reimb).toBe(320);
    // …but the month is a wash
    expect(m.net).toBe(0);
    expect(m.balance).toBe(0);
  });

  it("separates irregular spend from the monthly baseline", () => {
    const [m] = forecast({
      items: [
        item({ name: "Rent", kind: "expense", amount: 900 }),
        item({ name: "Insurance", kind: "expense", amount: 260, freq: "yearly" }),
      ],
      opening: 0,
      odRate: 0,
      horizon: 1,
      start: START,
    });
    expect(m.expense).toBe(1160);
    expect(m.irregular).toBe(260);
  });

  it("charges overdraft interest on the month-end balance, compounding", () => {
    const rows = forecast({
      items: [],
      opening: -1200,
      odRate: 12, // 1% a month
      horizon: 3,
      start: START,
    });

    expect(rows[0].interest).toBeCloseTo(12, 6);
    expect(rows[0].balance).toBe(-1212);
    // the second month's charge is bigger than the first — that's the point
    expect(rows[1].interest).toBeGreaterThan(rows[0].interest);
    expect(rows[1].interest).toBeCloseTo(12.12, 6);
    expect(rows[2].interest).toBeGreaterThan(rows[1].interest);
  });

  it("charges nothing once the account is above zero", () => {
    const rows = forecast({
      items: [item({ name: "Salary", kind: "income", amount: 2000 })],
      opening: -1000,
      odRate: 12,
      horizon: 2,
      start: START,
    });
    expect(rows[0].interest).toBe(0);
    expect(rows[0].balance).toBe(1000);
  });

  it("averages the lumps out across the horizon", () => {
    const rows = forecast({
      items: [
        item({ name: "Salary", kind: "income", amount: 2400 }),
        item({ name: "Urlaubsgeld", kind: "income", amount: 1400, freq: "yearly" }),
      ],
      opening: 0,
      odRate: 0,
      horizon: 12,
      start: START,
    });
    expect(avgOf(rows, "income")).toBeCloseTo(2400 + 1400 / 12, 6);
  });

  it("leaves per-payment amounts alone when the horizon changes", () => {
    const items = [
      item({ name: "Salary", kind: "income", amount: 2400 }),
      item({ name: "Insurance", kind: "expense", amount: 240, freq: "yearly" }),
    ];
    const twelve = forecast({ items, opening: 0, odRate: 0, horizon: 12, start: START });
    const twentyFour = forecast({ items, opening: 0, odRate: 0, horizon: 24, start: START });

    expect(avgOf(twelve, "expense")).toBeCloseTo(20, 6);
    expect(avgOf(twentyFour, "expense")).toBeCloseTo(20, 6);
    // the payment itself never moves
    expect(twelve[0].expense).toBe(240);
    expect(twentyFour[12].expense).toBe(240);
  });
});
