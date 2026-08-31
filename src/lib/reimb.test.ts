import { describe, expect, it } from "vitest";
import type { Item } from "../types";
import {
  creditAt,
  isDeferred,
  isPaid,
  reimbBetween,
  reimbEnd,
  reimbInMonth,
  reimbSchedule,
} from "./reimb";
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
    reimb: { who: "Sister", amount: 100, freq: "monthly", first: "", last: "", extras: [], advances: [], overrides: [], paid: [], deferred: [] },
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
      advances: [],
      overrides: [],
      paid: [],
      deferred: [],
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
      advances: [],
      overrides: [],
      paid: [],
      deferred: [],
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
    reimb: { who: "Housemate", amount: 300, freq: "quarterly", first: "2026-02", last: "", extras: [], advances: [], overrides: [], paid: [], deferred: [] },
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

describe("months that don't go as agreed", () => {
  /* Sara pays 20 a month. The four things that actually happen: she skips a
     month, she pays less, she pauses for a while, and she drops a lump sum. */
  const base20: Item = {
    ...base,
    last: "",
    reimb: {
      who: "Sara",
      amount: 20,
      freq: "monthly",
      first: "2026-01",
      last: "",
      extras: [],
      advances: [],
      overrides: [],
      paid: [],
      deferred: [],
    },
  };

  it("records a month she paid nothing", () => {
    const it0: Item = {
      ...base20,
      reimb: { ...base20.reimb!, overrides: [{ month: "2026-03", amount: 0 }] },
    };
    expect(reimbInMonth(it0, M("2026-02"))).toBe(20);
    expect(reimbInMonth(it0, M("2026-03"))).toBe(0);
    expect(reimbInMonth(it0, M("2026-04"))).toBe(20);
  });

  it("records a month she paid less", () => {
    const it0: Item = {
      ...base20,
      reimb: { ...base20.reimb!, overrides: [{ month: "2026-03", amount: 5 }] },
    };
    expect(reimbInMonth(it0, M("2026-03"))).toBe(5);
  });

  it("records a pause as a run of months", () => {
    const it0: Item = {
      ...base20,
      reimb: {
        ...base20.reimb!,
        overrides: [
          { month: "2026-03", amount: 0 },
          { month: "2026-04", amount: 0 },
          { month: "2026-05", amount: 0 },
        ],
      },
    };
    expect(reimbBetween(it0, M("2026-01"), M("2026-06"))).toBe(20 * 3);
    expect(reimbInMonth(it0, M("2026-06"))).toBe(20);
  });

  it("keeps a lump sum on top of an overridden month", () => {
    const it0: Item = {
      ...base20,
      reimb: {
        ...base20.reimb!,
        extras: [{ month: "2026-03", amount: 200 }],
        overrides: [{ month: "2026-03", amount: 0 }],
      },
    };
    // she paid no instalment that month but did drop the lump sum
    expect(reimbInMonth(it0, M("2026-03"))).toBe(200);
  });

  it("can pay in a month the schedule never asked for", () => {
    const quarterly: Item = {
      ...base,
      last: "",
      reimb: {
        who: "Sara",
        amount: 60,
        freq: "quarterly",
        first: "2026-01",
        last: "",
        extras: [],
        advances: [],
        overrides: [{ month: "2026-02", amount: 20 }],
        paid: [],
        deferred: [],
      },
    };
    expect(quarterly.reimb!.freq).toBe("quarterly");
    expect(reimbInMonth(quarterly, M("2026-02"))).toBe(20);
    expect(reimbInMonth(quarterly, M("2026-04"))).toBe(60);
  });

  it("lets a payment after the agreed end push the end out, but not a skip", () => {
    const ended: Item = {
      ...base,
      last: "",
      reimb: {
        who: "Sara",
        amount: 20,
        freq: "monthly",
        first: "2026-01",
        last: "2026-06",
        extras: [],
        advances: [],
        overrides: [{ month: "2026-09", amount: 40 }],
        paid: [],
        deferred: [],
      },
    };
    expect(reimbEnd(ended)).toBe(M("2026-09"));

    const skipped: Item = {
      ...ended,
      reimb: { ...ended.reimb!, overrides: [{ month: "2026-09", amount: 0 }] },
    };
    expect(reimbEnd(skipped)).toBe(M("2026-06"));
  });
});

describe("confirming a month, and holding one over", () => {
  const base20: Item = {
    ...base,
    last: "",
    reimb: {
      who: "Sara",
      amount: 20,
      freq: "monthly",
      first: "2026-01",
      last: "",
      extras: [],
      advances: [],
      overrides: [],
      paid: [],
      deferred: [],
    },
  };

  it("confirming a month changes no figure", () => {
    const it0: Item = { ...base20, reimb: { ...base20.reimb!, paid: ["2026-03"] } };
    expect(isPaid(it0, M("2026-03"))).toBe(true);
    expect(isPaid(it0, M("2026-04"))).toBe(false);
    // the plan already assumed it arrived, so nothing moves
    expect(reimbInMonth(it0, M("2026-03"))).toBe(20);
  });

  it("holding a month over empties it and doubles the next", () => {
    const it0: Item = { ...base20, reimb: { ...base20.reimb!, deferred: ["2026-03"] } };
    expect(reimbInMonth(it0, M("2026-02"))).toBe(20);
    expect(reimbInMonth(it0, M("2026-03"))).toBe(0);
    expect(reimbInMonth(it0, M("2026-04"))).toBe(40);
    expect(reimbInMonth(it0, M("2026-05"))).toBe(20);
    // nothing is lost along the way
    expect(reimbBetween(it0, M("2026-01"), M("2026-05"))).toBe(100);
  });

  it("lands two held-over months together in the third", () => {
    const it0: Item = {
      ...base20,
      reimb: { ...base20.reimb!, deferred: ["2026-03", "2026-04"] },
    };
    expect(reimbInMonth(it0, M("2026-03"))).toBe(0);
    expect(reimbInMonth(it0, M("2026-04"))).toBe(0);
    expect(reimbInMonth(it0, M("2026-05"))).toBe(60);
    expect(reimbBetween(it0, M("2026-01"), M("2026-05"))).toBe(100);
  });

  it("carries a held-over month past the agreed end rather than losing it", () => {
    const ending: Item = {
      ...base,
      last: "",
      reimb: {
        who: "Sara",
        amount: 20,
        freq: "monthly",
        first: "2026-01",
        last: "2026-06",
        extras: [],
        advances: [],
        overrides: [],
        paid: [],
        deferred: ["2026-06"],
      },
    };
    expect(reimbInMonth(ending, M("2026-06"))).toBe(0);
    expect(reimbInMonth(ending, M("2026-07"))).toBe(20);
    expect(reimbEnd(ending)).toBe(M("2026-07"));
  });

  it("lets an override overrule a hold-over, since it says what turned up", () => {
    const it0: Item = {
      ...base20,
      reimb: {
        ...base20.reimb!,
        deferred: ["2026-03"],
        overrides: [{ month: "2026-03", amount: 12 }],
      },
    };
    expect(isDeferred(it0, M("2026-03"))).toBe(false);
    expect(reimbInMonth(it0, M("2026-03"))).toBe(12);
    // and nothing travels to April, because nothing was held over
    expect(reimbInMonth(it0, M("2026-04"))).toBe(20);
  });

  it("keeps a lump sum on top of a held-over month", () => {
    const it0: Item = {
      ...base20,
      reimb: {
        ...base20.reimb!,
        deferred: ["2026-03"],
        extras: [{ month: "2026-03", amount: 90 }],
      },
    };
    expect(reimbInMonth(it0, M("2026-03"))).toBe(90);
    expect(reimbInMonth(it0, M("2026-04"))).toBe(40);
  });
});

describe("money paid ahead, rather than on top", () => {
  /* Sara's phone: 105 a month for a year, matching what he pays. She sends the
     balance early. The cost must not change — only when the money arrives. */
  const phone = (advances: { month: string; amount: number }[]): Item => ({
    ...base,
    amount: 105,
    first: "2026-01",
    last: "2026-12",
    reimb: {
      who: "Sara",
      amount: 105,
      freq: "monthly",
      first: "",
      last: "",
      extras: [],
      advances,
      overrides: [],
      paid: [],
      deferred: [],
    },
  });

  it("settles the instalments it covers instead of adding to them", () => {
    // two months paid as usual, then the remaining ten in one go
    const it0 = phone([{ month: "2026-03", amount: 1050 }]);
    expect(reimbInMonth(it0, M("2026-01"))).toBe(105);
    expect(reimbInMonth(it0, M("2026-02"))).toBe(105);
    expect(reimbInMonth(it0, M("2026-03"))).toBe(1050);
    expect(reimbInMonth(it0, M("2026-04"))).toBe(0);
    expect(reimbInMonth(it0, M("2026-12"))).toBe(0);
  });

  it("leaves the year's total exactly what was owed", () => {
    const it0 = phone([{ month: "2026-03", amount: 1050 }]);
    expect(reimbBetween(it0, M("2026-01"), M("2026-12"))).toBe(1260);
  });

  it("reports what is still paid ahead as credit", () => {
    const it0 = phone([{ month: "2026-03", amount: 1050 }]);
    // arrives in March and covers March itself first
    expect(creditAt(it0, M("2026-03"))).toBe(945);
    expect(creditAt(it0, M("2026-06"))).toBe(630);
    // ten instalments covered, so it runs out exactly at the end
    expect(creditAt(it0, M("2026-12"))).toBe(0);
  });

  it("keeps an overpayment visible as credit rather than swallowing it", () => {
    // she sends a full year's worth after already paying two months
    const it0 = phone([{ month: "2026-03", amount: 1260 }]);
    expect(reimbBetween(it0, M("2026-01"), M("2026-12"))).toBe(1470);
    // 210 more than the year needed, and it says so
    expect(creditAt(it0, M("2026-12"))).toBe(210);
  });

  it("still treats a lump sum on top as money beyond the agreement", () => {
    const onTop: Item = {
      ...phone([]),
      reimb: { ...phone([]).reimb!, extras: [{ month: "2026-03", amount: 200 }] },
    };
    // a bonus adds to the month and to the total
    expect(reimbInMonth(onTop, M("2026-03"))).toBe(305);
    expect(reimbBetween(onTop, M("2026-01"), M("2026-12"))).toBe(1460);
  });

  it("covers a quarterly repayment the same way", () => {
    const q: Item = {
      ...base,
      last: "",
      reimb: {
        who: "Sara",
        amount: 300,
        freq: "quarterly",
        first: "2026-01",
        last: "",
        extras: [],
        advances: [{ month: "2026-04", amount: 600 }],
        overrides: [],
        paid: [],
        deferred: [],
      },
    };
    expect(reimbInMonth(q, M("2026-01"))).toBe(300);
    expect(reimbInMonth(q, M("2026-04"))).toBe(600); // arrives, covers April's 300
    expect(reimbInMonth(q, M("2026-07"))).toBe(0); // covered by the rest
    expect(reimbInMonth(q, M("2026-10"))).toBe(300); // credit exhausted
  });

  it("lets an override stand over the ledger, and settles nothing that month", () => {
    const it0: Item = {
      ...phone([{ month: "2026-03", amount: 210 }]),
    };
    const withSaid: Item = {
      ...it0,
      reimb: { ...it0.reimb!, overrides: [{ month: "2026-04", amount: 0 }] },
    };
    // April says nothing turned up, so the credit is untouched and waits
    expect(reimbInMonth(withSaid, M("2026-04"))).toBe(0);
    expect(reimbInMonth(withSaid, M("2026-05"))).toBe(0);
    expect(creditAt(withSaid, M("2026-05"))).toBe(0);
  });
});

