import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { SCHEMA_VERSION } from "./constants";

/* A file exported by the earliest single-file version: no schemaVersion, no
   goals or assets arrays, no overdraft settings, and a repayment given as bare
   {who, amount} that implicitly followed the expense. */
const v0 = {
  items: [
    {
      id: "a1",
      name: "Miete",
      kind: "expense",
      cat: "Home",
      amount: 890,
      freq: "monthly",
      first: "2025-08",
      last: "",
    },
    {
      id: "a2",
      name: "Loan",
      kind: "expense",
      cat: "Debt & financing",
      amount: 320,
      freq: "monthly",
      first: "2026-03",
      last: "2029-03",
      reimb: { who: "Fiancé", amount: 320 },
    },
  ],
  opening: -1200,
  sample: false,
  horizon: 12,
};

describe("migrate", () => {
  it("brings a version-0 file forward without touching the figures", () => {
    const d = migrate(v0)!;
    expect(d).not.toBeNull();
    expect(d.schemaVersion).toBe(SCHEMA_VERSION);
    expect(d.items).toHaveLength(2);
    expect(d.items[0]).toEqual(v0.items[0]);
    // the repayment always meant "follows the expense" — now written out
    expect(d.items[1].reimb).toEqual({
      who: "Fiancé",
      amount: 320,
      freq: "monthly",
      first: "2026-03",
      last: "2029-03",
      extras: [],
    });
    expect(d.opening).toBe(-1200);
    // the fields that version never had come in at their defaults
    expect(d.goals).toEqual([]);
    expect(d.assets).toEqual([]);
    expect(d.overdraft).toBe(0);
    expect(d.odRate).toBe(0);
  });

  it("refuses anything that isn't a plan rather than wiping good data", () => {
    expect(migrate(null)).toBeNull();
    expect(migrate("nope")).toBeNull();
    expect(migrate({})).toBeNull();
    expect(migrate({ items: "lots" })).toBeNull();
    expect(migrate([1, 2, 3])).toBeNull();
  });

  it("accepts an empty plan", () => {
    const d = migrate({ items: [] })!;
    expect(d.items).toEqual([]);
    expect(d.horizon).toBe(12);
  });

  it("normalises sloppy months and drops junk rows", () => {
    const d = migrate({
      items: [
        { name: "Odd", kind: "expense", amount: "1.234,50", freq: "weekly", first: "2026-8" },
        null,
        42,
      ],
    })!;
    expect(d.items).toHaveLength(1);
    expect(d.items[0].first).toBe("2026-08");
    expect(d.items[0].amount).toBeCloseTo(1234.5);
    // an unknown frequency falls back rather than throwing the line away
    expect(d.items[0].freq).toBe("monthly");
    expect(d.items[0].id).toBeTruthy();
  });

  it("keeps amounts positive and rates signed", () => {
    const d = migrate({
      items: [],
      opening: "-1.200",
      overdraft: -6000,
      odRate: -11.5,
      assets: [{ name: "Golf", kind: "vehicle", value: 10000, rate: -15 }],
    })!;
    expect(d.opening).toBe(-1200);
    expect(d.overdraft).toBe(6000);
    expect(d.odRate).toBe(11.5);
    expect(d.assets[0].rate).toBe(-15);
  });

  it("clamps the horizon to one of the three offered", () => {
    expect(migrate({ items: [], horizon: 18 })!.horizon).toBe(18);
    expect(migrate({ items: [], horizon: 24 })!.horizon).toBe(24);
    expect(migrate({ items: [], horizon: 36 })!.horizon).toBe(12);
  });

  it("un-sets links that point at items which no longer exist", () => {
    const d = migrate({
      items: [],
      goals: [{ id: "g", name: "Wedding", target: 100, from: "2026-08", by: "2027-08", itemId: "gone" }],
      assets: [{ id: "a", name: "Pot", kind: "savings", value: 1, rate: 1, feed: "gone" }],
    })!;
    expect(d.goals[0].itemId).toBeUndefined();
    expect(d.assets[0].feed).toBeUndefined();
  });
});

/* A file exported by the later single-file version: repayments carry their own
   frequency, their own dates, and lump sums on top. */
const withSchedule = {
  items: [
    {
      id: "b1",
      name: "Deposit paid for a friend",
      kind: "expense",
      cat: "Family",
      amount: 3600,
      freq: "oneoff",
      first: "2026-03",
      last: "2026-03",
      reimb: {
        who: "Friend",
        amount: 300,
        freq: "monthly",
        first: "2026-04",
        last: "2027-03",
        extras: [{ month: "2026-12", amount: 500 }],
      },
    },
    {
      id: "b2",
      name: "Shared loan",
      kind: "expense",
      cat: "Debt & financing",
      amount: 400,
      freq: "monthly",
      first: "2026-01",
      last: "2030-01",
      // their share stops years before the loan does
      reimb: { who: "Sister", amount: 200, freq: "monthly", first: "", last: "2027-06", extras: [] },
    },
  ],
  opening: 0,
  horizon: 24,
};

describe("migrating a repayment that runs on its own clock", () => {
  const d = migrate(withSchedule)!;

  it("keeps the repayment's own frequency and dates", () => {
    expect(d.items[0].reimb).toEqual({
      who: "Friend",
      amount: 300,
      freq: "monthly",
      first: "2026-04",
      last: "2027-03",
      extras: [{ month: "2026-12", amount: 500 }],
    });
  });

  it("keeps a blank first, which means 'follow the expense'", () => {
    expect(d.items[1].reimb!.first).toBe("");
    expect(d.items[1].reimb!.last).toBe("2027-06");
  });

  it("never fills a stored schedule in from the item", () => {
    // the expense is a one-off; the repayment is emphatically not
    expect(d.items[0].freq).toBe("oneoff");
    expect(d.items[0].reimb!.freq).toBe("monthly");
  });

  it("drops lump sums with no month or no money, and keeps the rest", () => {
    const m = migrate({
      items: [
        {
          ...withSchedule.items[0],
          reimb: {
            ...withSchedule.items[0].reimb,
            extras: [
              { month: "2026-12", amount: 500 },
              { month: "", amount: 100 },
              { month: "2027-01", amount: 0 },
              { month: "2027-2", amount: "1.250,50" },
              null,
            ],
          },
        },
      ],
    })!;
    expect(m.items[0].reimb!.extras).toEqual([
      { month: "2026-12", amount: 500 },
      { month: "2027-02", amount: 1250.5 },
    ]);
  });

  it("keeps a repayment made only of lump sums", () => {
    const m = migrate({
      items: [
        {
          id: "c1",
          name: "Holiday fronted",
          kind: "expense",
          amount: 1200,
          freq: "oneoff",
          first: "2026-06",
          last: "2026-06",
          reimb: { who: "Brother", amount: 0, freq: "monthly", first: "", last: "", extras: [{ month: "2026-09", amount: 1200 }] },
        },
      ],
    })!;
    expect(m.items[0].reimb).toBeTruthy();
    expect(m.items[0].reimb!.amount).toBe(0);
    expect(m.items[0].reimb!.extras).toHaveLength(1);
  });

  it("drops a repayment with neither an instalment nor a lump sum", () => {
    const m = migrate({
      items: [{ id: "d", name: "X", kind: "expense", amount: 10, freq: "monthly", first: "2026-01", reimb: { who: "Nobody", amount: 0 } }],
    })!;
    expect(m.items[0].reimb).toBeUndefined();
  });

  it("round-trips its own export untouched", () => {
    const once = migrate(withSchedule)!;
    const twice = migrate(JSON.parse(JSON.stringify(once)))!;
    expect(twice).toEqual(once);
  });
});

describe("the goal spend month", () => {
  it("is absent in older backups, and stays absent", () => {
    const d = migrate({
      items: [],
      goals: [{ id: "g", name: "Wedding", target: 6000, from: "2026-08", by: "2027-08", saved: 0 }],
    })!;
    expect(d.goals[0].spend).toBeUndefined();
  });

  it("survives a round trip once set", () => {
    const d = migrate({
      items: [],
      goals: [
        { id: "g", name: "Wedding", target: 6000, from: "2026-08", by: "2027-08", saved: 0, spend: "2027-8" },
      ],
    })!;
    expect(d.goals[0].spend).toBe("2027-08");
    expect(migrate(JSON.parse(JSON.stringify(d)))!.goals[0].spend).toBe("2027-08");
  });

  it("drops a spend month that isn't a month", () => {
    const d = migrate({
      items: [],
      goals: [{ id: "g", name: "X", target: 1, from: "2026-08", by: "2027-08", saved: 0, spend: "soon" }],
    })!;
    expect(d.goals[0].spend).toBeUndefined();
  });
});

