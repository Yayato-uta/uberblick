import { describe, expect, it } from "vitest";
import type { Item, Reimb } from "../types";
import { avgOf, forecast } from "./forecast";
import { fromYM } from "./month";

const START = fromYM("2026-08")!;

/* A repayment may be given as just {who, amount} — the shape the earliest
   backups used, meaning "follows the expense exactly". Filling it out here is
   what the migration does on load, so these tests keep asserting the old
   behaviour against the new model. */
type LooseReimb = { who: string; amount: number } & Partial<Reimb>;
type Loose = Omit<Partial<Item>, "reimb"> & { reimb?: LooseReimb };

function fill(o: Omit<Item, "reimb"> & { reimb?: LooseReimb }): Item {
  const { reimb, ...rest } = o;
  if (!reimb) return rest;
  return {
    ...rest,
    reimb: { freq: rest.freq, first: rest.first, last: rest.last, extras: [], ...reimb },
  };
}

const item = (over: Loose & Pick<Item, "name" | "kind" | "amount">): Item =>
  fill({
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

describe("a repayment running on its own clock", () => {
  /* The brief's worked example: 3600 out in one go, repaid at 300 a month for
     the twelve months after. */
  const oneoff = item({
    name: "Deposit fronted",
    kind: "expense",
    amount: 3600,
    freq: "oneoff",
    first: "2026-08",
    last: "2026-08",
    reimb: {
      who: "Friend",
      amount: 300,
      freq: "monthly",
      first: "2026-09",
      last: "2027-08",
      extras: [],
    },
  });

  const rows = forecast({ items: [oneoff], opening: 0, odRate: 0, horizon: 13, start: START });

  it("shows the full amount out in the first month and nothing back", () => {
    expect(rows[0].expense).toBe(3600);
    expect(rows[0].reimb).toBe(0);
    expect(rows[0].net).toBe(-3600);
  });

  it("collects the repayments in the months after, with no expense going out", () => {
    for (let k = 1; k <= 12; k++) {
      expect(rows[k].expense).toBe(0);
      expect(rows[k].reimb).toBe(300);
      expect(rows[k].net).toBe(300);
    }
  });

  it("keeps the item in those months so the breakdown can show it", () => {
    // it is here for the repayment alone — the view marks it "repayment only"
    expect(rows[5].hits.map((i) => i.id)).toContain("Deposit fronted");
  });

  it("comes out level once every instalment has landed", () => {
    expect(rows[12].balance).toBe(0);
  });
});

describe("a lump sum outside the regular rate", () => {
  const financed = item({
    name: "Financing",
    kind: "expense",
    amount: 200,
    first: "2026-08",
    last: "2027-07",
    reimb: {
      who: "Partner",
      amount: 100,
      freq: "monthly",
      first: "2026-08",
      last: "2026-09",
      extras: [{ month: "2026-11", amount: 500 }],
    },
  });

  const rows = forecast({ items: [financed], opening: 0, odRate: 0, horizon: 6, start: START });

  it("lands in its month even though no instalment is due then", () => {
    expect(rows[3].reimb).toBe(500);
    expect(rows[3].expense).toBe(200);
  });

  it("leaves the months around it alone", () => {
    expect(rows[2].reimb).toBe(0);
    expect(rows[4].reimb).toBe(0);
  });
});

describe("a repayment that stops before the expense does", () => {
  const shared = item({
    name: "Shared loan",
    kind: "expense",
    amount: 400,
    first: "2026-08",
    last: "2027-07",
    reimb: {
      who: "Sister",
      amount: 400,
      freq: "monthly",
      first: "2026-08",
      last: "2026-10",
      extras: [],
    },
  });

  const rows = forecast({ items: [shared], opening: 0, odRate: 0, horizon: 6, start: START });

  it("is a wash while they are still paying", () => {
    expect(rows[0].net).toBe(0);
    expect(rows[2].net).toBe(0);
  });

  it("lands wholly on you the month after they stop", () => {
    expect(rows[3].expense).toBe(400);
    expect(rows[3].reimb).toBe(0);
    expect(rows[3].net).toBe(-400);
  });
});

