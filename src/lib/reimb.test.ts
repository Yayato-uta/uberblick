import { describe, expect, it } from "vitest";
import type { Item } from "../types";
import { reimbBetween, reimbEnd, reimbInMonth, reimbSchedule } from "./reimb";
import { fromYM } from "./month";

const M = (ym: string) => fromYM(ym)!;

const base: Item = {
  id: "x",
  name: "Thing",
  kind: "expense",
  cat: "Other",
  amount: 100,
  freq: "monthly",
  first: "2026-01",
  last: "2026-12",
};

describe("a repayment that leaves its dates blank", () => {
  const it0: Item = {
    ...base,
    reimb: { who: "Sister", amount: 100, freq: "monthly", first: "", last: "", extras: [] },
  };

  it("falls back to the expense's own dates", () => {
    const s = reimbSchedule(it0)!;
    expect(s.first).toBe("2026-01");
    expect(s.last).toBe("2026-12");
  });

  it("mirrors the expense exactly, which is what old backups meant", () => {
    expect(reimbInMonth(it0, M("2025-12"))).toBe(0);
    expect(reimbInMonth(it0, M("2026-01"))).toBe(100);
    expect(reimbInMonth(it0, M("2026-12"))).toBe(100);
    expect(reimbInMonth(it0, M("2027-01"))).toBe(0);
    expect(reimbEnd(it0)).toBe(M("2026-12"));
  });
});

describe("a one-off repaid monthly over a year", () => {
  /* The case the brief calls out: the whole amount goes out in March, and it
     comes back in twelve instalments starting in April. */
  const loan: Item = {
    ...base,
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
      extras: [],
    },
  };

  it("pays nothing back in the month the money goes out", () => {
    expect(reimbInMonth(loan, M("2026-03"))).toBe(0);
  });

  it("pays back every month after, long past the expense's own end", () => {
    expect(reimbInMonth(loan, M("2026-04"))).toBe(300);
    expect(reimbInMonth(loan, M("2027-03"))).toBe(300);
    expect(reimbInMonth(loan, M("2027-04"))).toBe(0);
  });

  it("comes back to the full amount over its own span", () => {
    expect(reimbBetween(loan, M("2026-03"), M("2027-03"))).toBe(3600);
    expect(reimbEnd(loan)).toBe(M("2027-03"));
  });
});

describe("lump sums on top", () => {
  const financed: Item = {
    ...base,
    amount: 200,
    reimb: {
      who: "Partner",
      amount: 50,
      freq: "monthly",
      first: "2026-01",
      last: "2026-06",
      extras: [
        { month: "2026-03", amount: 400 },
        { month: "2026-09", amount: 250 },
      ],
    },
  };

  it("adds a lump sum to the instalment due the same month", () => {
    expect(reimbInMonth(financed, M("2026-03"))).toBe(450);
  });

  it("still arrives in a month with no instalment due", () => {
    expect(reimbInMonth(financed, M("2026-09"))).toBe(250);
  });

  it("pushes the end out to the last lump sum", () => {
    expect(reimbEnd(financed)).toBe(M("2026-09"));
  });

  it("leaves an open-ended repayment open, dated lump sums notwithstanding", () => {
    const open: Item = {
      ...financed,
      last: "",
      reimb: { ...financed.reimb!, last: "" },
    };
    expect(reimbEnd(open)).toBeNull();
  });
});

describe("a repayment on a different cycle from the expense", () => {
  /* A monthly bill somebody settles quarterly. Anchored on the repayment's own
     first month, not on January and not on the bill's. */
  const it0: Item = {
    ...base,
    last: "",
    reimb: { who: "Housemate", amount: 300, freq: "quarterly", first: "2026-02", last: "", extras: [] },
  };

  it("recurs on its own anchor", () => {
    expect(reimbInMonth(it0, M("2026-01"))).toBe(0);
    expect(reimbInMonth(it0, M("2026-02"))).toBe(300);
    expect(reimbInMonth(it0, M("2026-03"))).toBe(0);
    expect(reimbInMonth(it0, M("2026-05"))).toBe(300);
    expect(reimbInMonth(it0, M("2026-08"))).toBe(300);
  });
});

describe("an item with nobody paying it back", () => {
  it("has no schedule and returns nothing", () => {
    expect(reimbSchedule(base)).toBeNull();
    expect(reimbInMonth(base, M("2026-01"))).toBe(0);
    expect(reimbEnd(base)).toBeNull();
  });
});
