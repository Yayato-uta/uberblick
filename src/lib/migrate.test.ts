import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { SCHEMA_VERSION } from "./constants";

/* A file exported by the original single-file version: no schemaVersion, no
   goals or assets arrays, no overdraft settings. */
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
    expect(d.items[1].reimb).toEqual({ who: "Fiancé", amount: 320 });
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
