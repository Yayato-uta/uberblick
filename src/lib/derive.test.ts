import { describe, expect, it } from "vitest";
import type { Data, Item, Reimb } from "../types";
import { derive } from "./derive";
import { emptyData } from "./constants";
import { fromYM, toYM } from "./month";

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

const item = (over: Loose & Pick<Item, "id" | "name" | "kind" | "amount">): Item =>
  fill({
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

describe("when a repayment stops before the expense does", () => {
  /* Twelve payments of 400 from Aug 2026; Sister covers only the first three.
     The brief calls this the unpleasant surprise, and it has to read the right
     way round in both lists. */
  const shared = item({
    id: "shared",
    name: "Shared loan",
    kind: "expense",
    amount: 400,
    first: toYM(START),
    last: toYM(START + 11),
    reimb: {
      who: "Sister",
      amount: 400,
      freq: "monthly",
      first: toYM(START),
      last: toYM(START + 2),
      extras: [],
    },
  });

  const d = derive(plan({ horizon: 12, items: [shared] }), START);

  it("names the month their share runs out", () => {
    expect(d.costRises).toHaveLength(1);
    expect(d.costRises[0].rEnd).toBe(START + 2);
    expect(d.costRises[0].monthsUntil).toBe(3);
    expect(d.costRises[0].who).toBe("Sister");
  });

  it("adds up the payments that land on you afterwards", () => {
    expect(d.costRises[0].n).toBe(9);
    expect(d.costRises[0].total).toBe(3600);
    expect(d.costRises[0].perMonth).toBe(400);
  });

  it("frees up the FULL amount when the expense finally ends", () => {
    // by then nobody is repaying it, so the whole 400 comes back to you
    expect(d.ending[0].stillCovered).toBe(false);
    expect(d.ending[0].net).toBe(400);
    expect(d.freedTotal).toBe(400);
  });

  it("counts only their three payments as still to come", () => {
    expect(d.people[0].outstanding).toBe(1200);
    expect(d.people[0].items[0].paymentsLeft).toBe(3);
    expect(d.people[0].items[0].aloneMonths).toBe(9);
    expect(d.people[0].items[0].alone).toBe(3600);
  });

  it("leaves the rest of the loan on your committed total", () => {
    expect(d.committed).toBe(12 * 400 - 3 * 400);
  });
});

describe("when somebody covers an expense right to its end", () => {
  const covered = item({
    id: "phone",
    name: "Second phone",
    kind: "expense",
    amount: 30,
    first: toYM(START),
    last: toYM(START + 11),
    reimb: { who: "Sister", amount: 30 },
  });

  const d = derive(plan({ horizon: 12, items: [covered] }), START);

  it("frees up nothing when it ends, and says who was covering it", () => {
    expect(d.ending[0].stillCovered).toBe(true);
    expect(d.ending[0].net).toBe(0);
    expect(d.freedTotal).toBe(0);
  });

  it("never turns up under cost goes up", () => {
    expect(d.costRises).toHaveLength(0);
  });

  it("costs nothing and commits you to nothing", () => {
    expect(d.netCost).toBe(0);
    expect(d.committed).toBe(0);
  });
});

describe("a one-off repaid over the following year", () => {
  const fronted = item({
    id: "fronted",
    name: "Deposit fronted",
    kind: "expense",
    amount: 3600,
    freq: "oneoff",
    first: toYM(START),
    last: toYM(START),
    reimb: {
      who: "Friend",
      amount: 300,
      freq: "monthly",
      first: toYM(START + 1),
      last: toYM(START + 12),
      extras: [{ month: toYM(START + 4), amount: 600 }],
    },
  });

  const d = derive(plan({ horizon: 12, items: [fronted] }), START);

  it("counts the lump sum in what is still to come", () => {
    // twelve instalments plus the 600 dropped in month four
    expect(d.people[0].outstanding).toBe(3600 + 600);
    expect(d.people[0].items[0].lumps).toHaveLength(1);
  });

  it("averages the repayments across the horizon, not per payment", () => {
    // eleven instalments and one lump sum fall inside the twelve months shown
    expect(d.people[0].monthly).toBeCloseTo((11 * 300 + 600) / 12, 6);
  });

  it("puts the expense's own end behind it, so nothing is freed up later", () => {
    expect(d.ending).toHaveLength(1);
    expect(d.ending[0].perMonth).toBe(0);
  });

  it("never lets the repayment push committed below zero", () => {
    expect(d.committed).toBe(0);
  });
});

describe("spending a goal's pot on the thing it was saved for", () => {
  /* Save 500 a month for a year, then pay the 6000 out of the pot. The money
     already left the account on the way in, so the purchase must not hit the
     balance a second time. */
  const goal = {
    id: "wedding",
    name: "Wedding",
    target: 6000,
    from: toYM(START),
    by: toYM(START + 11),
    saved: 0,
    itemId: "pot-feed",
    spend: toYM(START + 11),
  };
  const feed = item({
    id: "pot-feed",
    name: "Wedding saving",
    kind: "saving",
    amount: 500,
    first: toYM(START),
    last: toYM(START + 11),
  });

  const d = derive(plan({ horizon: 12, items: [feed], goals: [goal] }), START);

  it("shows the spend in its month", () => {
    expect(d.spends).toHaveLength(1);
    expect(d.months[11].fromSavings).toBe(6000);
    expect(d.months[11].spends[0].name).toBe("Wedding");
  });

  it("leaves every other month alone", () => {
    expect(d.months.slice(0, 11).every((m) => m.fromSavings === 0)).toBe(true);
  });

  it("never charges it against the balance", () => {
    // twelve months of saving and nothing else: the account is down 6000, and
    // the purchase does not take another 6000 out of it
    expect(d.months[11].balance).toBe(-6000);
    expect(d.months[11].net).toBe(-500);
    expect(d.months[11].expense).toBe(0);
  });

  it("draws down the pot it was saved into", () => {
    const withPot = derive(
      plan({
        horizon: 12,
        items: [feed],
        goals: [goal],
        assets: [{ id: "pot", name: "Wedding pot", kind: "savings", value: 0, rate: 0, feed: "pot-feed" }],
      }),
      START,
    );
    // eleven months of 500 in, then the twelfth pays in and empties it
    expect(withPot.assetSeries.rows[10].pot).toBe(5500);
    expect(withPot.assetSeries.ending[0]).toBeCloseTo(0, 6);
  });

  it("counts the withdrawal as spent, not as the pot having shrunk", () => {
    const withPot = derive(
      plan({
        horizon: 12,
        items: [feed],
        goals: [goal],
        assets: [{ id: "pot", name: "Wedding pot", kind: "savings", value: 0, rate: 0, feed: "pot-feed" }],
      }),
      START,
    );
    expect(withPot.putIn).toBe(6000);
    expect(withPot.takenOut).toBe(6000);
    // nothing was gained or lost — it all went in and came back out again
    expect(withPot.growth).toBeCloseTo(0, 6);
  });

  it("leaves a pot alone when the goal was never linked to it", () => {
    const unlinked = derive(
      plan({
        horizon: 12,
        items: [feed],
        goals: [{ ...goal, itemId: undefined }],
        assets: [{ id: "pot", name: "Other pot", kind: "savings", value: 0, rate: 0, feed: "pot-feed" }],
      }),
      START,
    );
    expect(unlinked.assetSeries.ending[0]).toBeCloseTo(6000, 6);
  });
});

describe("a goal that has already been spent", () => {
  const spentGoal = {
    id: "trip",
    name: "Trip",
    target: 2000,
    from: toYM(START - 12),
    by: toYM(START - 1),
    saved: 0,
    spend: toYM(START - 1),
  };

  const d = derive(plan({ horizon: 12, goals: [spentGoal] }), START);

  it("knows the spend is behind it", () => {
    expect(d.goalRows[0].spentAlready).toBe(true);
  });

  it("stops competing for this month's slack", () => {
    expect(d.goalsToFund).toBe(0);
    expect(d.goalsLater).toBe(0);
  });

  it("keeps the spend out of a horizon it doesn't fall in", () => {
    expect(d.months.every((m) => m.fromSavings === 0)).toBe(true);
  });
});

describe("goals without a spend month", () => {
  it("behave exactly as before", () => {
    const d = derive(
      plan({
        horizon: 12,
        goals: [
          { id: "g", name: "Deposit", target: 1200, from: toYM(START), by: toYM(START + 11), saved: 0 },
        ],
      }),
      START,
    );
    expect(d.spends).toEqual([]);
    expect(d.goalRows[0].spendIdx).toBeNull();
    expect(d.goalRows[0].spentAlready).toBe(false);
    expect(d.months.every((m) => m.fromSavings === 0 && m.spends.length === 0)).toBe(true);
    expect(d.goalsToFund).toBeCloseTo(100, 6);
  });
});

describe("an expense paid out of a fund", () => {
  const pot = { id: "pot", name: "House pot", kind: "savings" as const, value: 12000, rate: 0 };

  /* Quarterly, out of the pot: the fund empties in instalments rather than all
     at once, and the current account never sees any of it. */
  const roof = item({
    id: "roof",
    name: "Roof repairs",
    kind: "expense",
    amount: 1500,
    freq: "quarterly",
    first: toYM(START),
    last: toYM(START + 9),
    fund: "pot",
  });

  const d = derive(plan({ horizon: 12, items: [roof], assets: [pot] }), START);

  it("never leaves the account", () => {
    expect(d.months.every((m) => m.expense === 0)).toBe(true);
    expect(d.months.every((m) => m.balance === 0)).toBe(true);
    expect(d.mExpense).toBe(0);
    expect(d.netCost).toBe(0);
  });

  it("shows in the months it falls due, and only those", () => {
    const due = d.months.filter((m) => m.fromSavings > 0).map((m) => m.k);
    expect(due).toEqual([0, 3, 6, 9]);
    expect(d.months[0].spends[0]).toMatchObject({ name: "Roof repairs", amount: 1500, from: "fund" });
  });

  it("empties the fund on its own schedule", () => {
    // four payments of 1500 out of 12000
    expect(d.assetSeries.rows[0].pot).toBe(10500);
    expect(d.assetSeries.rows[3].pot).toBe(9000);
    expect(d.assetSeries.ending[0]).toBeCloseTo(6000, 6);
    expect(d.takenOut).toBe(6000);
  });

  it("counts the drawdown as spent rather than as the fund shrinking", () => {
    expect(d.growth).toBeCloseTo(0, 6);
  });

  it("is not a claim on your account, so it isn't committed", () => {
    expect(d.committed).toBe(0);
  });

  it("frees up nothing in your pocket when it ends", () => {
    expect(d.ending).toHaveLength(0);
    expect(d.freedTotal).toBe(0);
  });

  it("keeps it out of the expense groups, which are account-facing", () => {
    expect(d.months[0].hits).toHaveLength(0);
  });
});

describe("an expense whose fund is the account", () => {
  it("behaves exactly as before", () => {
    const normal = item({
      id: "roof",
      name: "Roof repairs",
      kind: "expense",
      amount: 1500,
      freq: "quarterly",
      first: toYM(START),
      last: toYM(START + 9),
    });
    const d = derive(plan({ horizon: 12, items: [normal] }), START);
    expect(d.months[0].expense).toBe(1500);
    expect(d.months[0].fromSavings).toBe(0);
    expect(d.months[0].irregular).toBe(1500);
    expect(d.committed).toBe(6000);
    expect(d.ending).toHaveLength(1);
  });
});

describe("a budget pot in the plan", () => {
  const food = {
    id: "food",
    name: "Food",
    monthly: 300,
    from: toYM(START),
    last: "",
    opening: 0,
  };

  it("takes its allocation out of the account every month", () => {
    const d = derive(plan({ horizon: 12, opening: 0, pots: [food] }), START);
    expect(d.months[0].potAllocated).toBe(300);
    expect(d.months[0].expense).toBe(300);
    expect(d.months[0].net).toBe(-300);
    // and it keeps coming out, spent or not
    expect(d.months[11].balance).toBe(-3600);
    expect(d.netCost).toBe(300);
  });

  it("does not charge the account again when you actually buy something", () => {
    const spent = plan({
      horizon: 12,
      opening: 0,
      pots: [food],
      purchases: [
        { id: "a", potId: "food", date: `${toYM(START)}-04`, note: "Billa", amount: 120 },
      ],
    });
    const d = derive(spent, START);
    // the purchase shows against the pot, never against the balance
    expect(d.months[0].expense).toBe(300);
    expect(d.months[0].balance).toBe(-300);
    expect(d.potRows[0].spent).toBe(120);
    expect(d.potRows[0].left).toBe(180);
  });

  it("reports the pot as it stands in whichever month is being looked at", () => {
    const data = plan({
      horizon: 12,
      pots: [food],
      purchases: [
        { id: "a", potId: "food", date: `${toYM(START)}-04`, amount: 120, note: "" },
        { id: "b", potId: "food", date: `${toYM(START + 1)}-09`, amount: 50, note: "" },
      ],
    });

    const now = derive(data, START);
    expect(now.potMonthIdx).toBe(START);
    expect(now.potRows[0].carriedIn).toBe(0);
    expect(now.potRows[0].left).toBe(180);

    const next = derive(data, START, START + 1);
    expect(next.potMonthIdx).toBe(START + 1);
    // last month's 180 rolls in on top of the new 300
    expect(next.potRows[0].carriedIn).toBe(180);
    expect(next.potRows[0].available).toBe(480);
    expect(next.potRows[0].spent).toBe(50);
    expect(next.potRows[0].left).toBe(430);
    expect(next.potRows[0].purchases).toHaveLength(1);
  });

  it("totals every pot for the month on show", () => {
    const d = derive(
      plan({
        horizon: 12,
        pots: [food, { ...food, id: "petrol", name: "Petrol", monthly: 120 }],
        purchases: [{ id: "a", potId: "petrol", date: `${toYM(START)}-04`, amount: 40, note: "" }],
      }),
      START,
    );
    expect(d.potAllocated).toBe(420);
    expect(d.potSpent).toBe(40);
    expect(d.potLeft).toBe(380);
  });

  it("changes nothing for a plan with no pots", () => {
    const d = derive(plan({ horizon: 12, opening: 0 }), START);
    expect(d.potRows).toEqual([]);
    expect(d.months.every((m) => m.potAllocated === 0)).toBe(true);
    expect(d.months[0].expense).toBe(0);
  });
});

