import { describe, expect, it } from "vitest";
import type { Data, Item } from "../types";
import { derive } from "./derive";
import { emptyData } from "./constants";
import { fromYM, toYM } from "./month";

const START = fromYM("2026-08")!;

const item = (over: Partial<Item> & Pick<Item, "id" | "name" | "kind" | "amount">): Item => ({
  cat: "Other",
  freq: "monthly",
  first: "2026-08",
  last: "",
  ...over,
});

const plan = (over: Partial<Data> = {}): Data => ({ ...emptyData(), ...over });

describe("headline figures", () => {
  const d = derive(
    plan({
      opening: 0,
      items: [
        item({ id: "sal", name: "Salary", kind: "income", amount: 2400 }),
        item({ id: "rent", name: "Rent", kind: "expense", amount: 900 }),
        item({
          id: "loan",
          name: "Loan for fiancé",
          kind: "expense",
          amount: 320,
          reimb: { who: "Fiancé", amount: 320 },
        }),
        item({ id: "spar", name: "Sparbuch", kind: "saving", amount: 100 }),
      ],
    }),
    START,
  );

  it("takes what comes back off what it really costs", () => {
    expect(d.mExpense).toBe(1220);
    expect(d.mReimb).toBe(320);
    expect(d.netCost).toBe(900);
  });

  it("works out what's left after bills and savings", () => {
    expect(d.leftover).toBe(2400 + 320 - 1220 - 100);
  });

  it("reports what rides on other people", () => {
    expect(d.passThrough).toBe(320);
    expect(d.people).toHaveLength(1);
    expect(d.people[0].who).toBe("Fiancé");
  });
});

describe("the overdraft floor", () => {
  const d = derive(
    plan({
      opening: -1000,
      overdraft: 2000,
      items: [item({ id: "rent", name: "Rent", kind: "expense", amount: 400 })],
    }),
    START,
  );

  it("measures headroom against the limit, not against zero", () => {
    expect(d.floor).toBe(-2000);
    expect(d.lowest.balance).toBe(-1000 - 400 * 12);
    expect(d.headroom).toBe(d.lowest.balance + 2000);
  });

  it("names the month the limit is breached", () => {
    expect(d.breach).toBeDefined();
    // month ends: -1400, -1800, -2200 → the third is the first past -2000
    expect(d.breach!.k).toBe(2);
  });

  it("has nothing to report when the plan stays inside the limit", () => {
    const safe = derive(plan({ opening: 500, overdraft: 2000 }), START);
    expect(safe.breach).toBeUndefined();
    expect(safe.clearsBy?.k).toBe(0);
  });
});

describe("what frees up when something ends", () => {
  const d = derive(
    plan({
      items: [
        item({
          id: "laptop",
          name: "Laptop financing",
          kind: "expense",
          amount: 49,
          last: toYM(START + 2),
        }),
        item({
          id: "phone",
          name: "Sister's phone",
          kind: "expense",
          amount: 32,
          last: toYM(START + 10),
          reimb: { who: "Sister", amount: 32 },
        }),
      ],
    }),
    START,
  );

  it("lists soonest first with the months remaining", () => {
    expect(d.ending.map((e) => e.id)).toEqual(["laptop", "phone"]);
    expect(d.ending[0].monthsLeft).toBe(3);
    expect(d.ending[1].monthsLeft).toBe(11);
  });

  it("frees up nothing where somebody else was paying", () => {
    expect(d.ending[0].net).toBe(49);
    expect(d.ending[1].net).toBe(0);
    expect(d.freedTotal).toBe(49);
  });

  it("counts only your own share as still committed", () => {
    // 3 × 49 for the laptop, nothing for the phone the sister repays
    expect(d.committed).toBe(147);
  });
});

describe("goals", () => {
  it("spreads what's left to find across the months available", () => {
    const d = derive(
      plan({
        goals: [
          {
            id: "g1",
            name: "Wedding",
            target: 6000,
            saved: 1200,
            from: toYM(START),
            by: toYM(START + 11),
          },
        ],
      }),
      START,
    );
    const g = d.goalRows[0];
    expect(g.monthsLeft).toBe(12);
    expect(g.need).toBe(4800);
    expect(g.perMonth).toBe(400);
    expect(g.later).toBe(false);
    expect(d.goalsToFund).toBe(400);
  });

  it("keeps a goal that starts later out of the current comparison", () => {
    const d = derive(
      plan({
        goals: [
          {
            id: "g2",
            name: "Honeymoon",
            target: 2400,
            saved: 0,
            from: toYM(START + 6),
            by: toYM(START + 17),
          },
        ],
      }),
      START,
    );
    const g = d.goalRows[0];
    expect(g.later).toBe(true);
    expect(g.monthsLeft).toBe(12);
    expect(g.perMonth).toBe(200);
    expect(d.goalsToFund).toBe(0);
    expect(d.goalsLater).toBe(200);
  });

  it("stops counting a goal once it is in the plan", () => {
    const d = derive(
      plan({
        items: [item({ id: "sv", name: "Wedding", kind: "saving", amount: 400 })],
        goals: [
          {
            id: "g3",
            name: "Wedding",
            target: 4800,
            saved: 0,
            from: toYM(START),
            by: toYM(START + 11),
            itemId: "sv",
          },
        ],
      }),
      START,
    );
    expect(d.goalRows[0].inPlan).toBe(true);
    expect(d.goalRows[0].planned).toBe(400);
    expect(d.goalsToFund).toBe(0);
  });

  it("un-links gracefully when the saving line is gone", () => {
    const d = derive(
      plan({
        goals: [
          {
            id: "g4",
            name: "Wedding",
            target: 1200,
            saved: 0,
            from: toYM(START),
            by: toYM(START + 11),
            itemId: "deleted",
          },
        ],
      }),
      START,
    );
    expect(d.goalRows[0].inPlan).toBe(false);
    expect(d.goalsToFund).toBe(100);
  });
});

describe("what you own", () => {
  it("grows a pot, shrinks a car, and adds the linked saving", () => {
    const d = derive(
      plan({
        opening: 0,
        horizon: 12,
        items: [item({ id: "sv", name: "Sparbuch", kind: "saving", amount: 100 })],
        assets: [
          { id: "pot", name: "Wohnsparbuch", kind: "savings", value: 1000, rate: 12, feed: "sv" },
          { id: "car", name: "Golf", kind: "vehicle", value: 10000, rate: -12 },
        ],
      }),
      START,
    );

    // first month: 1000 × 1.01 + 100
    expect(d.assetSeries.rows[0].pot).toBe(1110);
    expect(d.assetSeries.rows[0].car).toBe(9900);

    expect(d.assetsNow).toBe(11000);
    expect(d.putIn).toBe(1200);
    // the car is worth less than it was, so growth over the pair is net of that
    expect(d.assetsEnd).toBeLessThan(d.assetsNow + d.putIn);
    expect(d.growth).toBeCloseTo(d.assetsEnd - d.assetsNow - d.putIn, 6);
  });

  it("takes what's still owed off net worth", () => {
    const d = derive(
      plan({
        opening: -500,
        items: [
          item({
            id: "fin",
            name: "Laptop",
            kind: "expense",
            amount: 50,
            last: toYM(START + 3),
          }),
        ],
        assets: [{ id: "pot", name: "Sparbuch", kind: "savings", value: 2000, rate: 0 }],
      }),
      START,
    );
    expect(d.committed).toBe(200);
    expect(d.netWorthNow).toBe(2000 - 500 - 200);
  });
});

describe("people who pay you back", () => {
  it("averages across the horizon, so a repayment ending early reads lower", () => {
    const d = derive(
      plan({
        horizon: 12,
        items: [
          item({
            id: "loan",
            name: "Loan",
            kind: "expense",
            amount: 100,
            last: toYM(START + 5),
            reimb: { who: "Fiancé", amount: 100 },
          }),
        ],
      }),
      START,
    );
    const p = d.people[0];
    // six payments of 100 spread over twelve months
    expect(p.monthly).toBeCloseTo(50, 6);
    expect(p.outstanding).toBe(600);
    expect(p.ongoing).toBe(false);
  });
});
