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
    reimb: {
      freq: rest.freq,
      first: rest.first,
      last: rest.last,
      extras: [],
      advances: [],
      overrides: [],
      paid: [],
      deferred: [],
      ...reimb,
    },
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
    from: "pot",
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

  it("is listed in the month so it can be shown, but never as account outflow", () => {
    // it stays in `hits` for the month's own section to find…
    expect(d.months[0].hits.map((i) => i.id)).toEqual(["roof"]);
    // …while contributing nothing to what leaves the account
    expect(d.months[0].expense).toBe(0);
    // and it is a fund draw, not a pot draw — the two are listed separately
    expect(d.months[0].potSpend).toBe(0);
    expect(d.months[0].fromSavings).toBe(1500);
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
    kind: "spending" as const,
    monthly: 300,
    balance: 0,
    first: toYM(START),
    last: "",
  };

  it("takes its allocation out of the account every month", () => {
    const d = derive(plan({ horizon: 12, opening: 0, pots: [food] }), START);
    expect(d.months[0].potFund).toBe(300);
    // funding is its own column now, not folded into the bills
    expect(d.months[0].expense).toBe(0);
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
    expect(d.months[0].potFund).toBe(300);
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
    expect(d.months.every((m) => m.potFund === 0)).toBe(true);
    expect(d.months[0].expense).toBe(0);
  });
});

describe("what is still left to pay on a line that ends", () => {
  it("adds up every payment from now to the last one", () => {
    const d = derive(
      plan({
        horizon: 12,
        items: [
          item({
            id: "wm",
            name: "Waschmaschine",
            kind: "expense",
            amount: 57.5,
            first: toYM(START - 6),
            last: toYM(START + 5),
          }),
        ],
      }),
      START,
    );
    // six payments left, this month included — not the twelve of the contract
    expect(d.ending[0].paymentsLeft).toBe(6);
    expect(d.ending[0].remaining).toBeCloseTo(345, 6);
    expect(d.ending[0].remainingNet).toBeCloseTo(345, 6);
    expect(d.endingRemaining).toBeCloseTo(345, 6);
  });

  it("counts only what is genuinely yours once somebody repays it", () => {
    const d = derive(
      plan({
        horizon: 12,
        items: [
          item({
            id: "loan",
            name: "Shared loan",
            kind: "expense",
            amount: 100,
            first: toYM(START),
            last: toYM(START + 5),
            reimb: { who: "Sara", amount: 60 },
          }),
        ],
      }),
      START,
    );
    expect(d.ending[0].remaining).toBe(600);
    expect(d.ending[0].remainingNet).toBe(240);
    expect(d.endingRemainingNet).toBe(240);
  });

  it("counts a skipped month as money you carry yourself", () => {
    const d = derive(
      plan({
        horizon: 12,
        items: [
          item({
            id: "loan",
            name: "Shared loan",
            kind: "expense",
            amount: 100,
            first: toYM(START),
            last: toYM(START + 5),
            reimb: { who: "Sara", amount: 100, overrides: [{ month: toYM(START + 1), amount: 0 }] },
          }),
        ],
      }),
      START,
    );
    // she covers five of the six, so one payment lands on you
    expect(d.ending[0].remaining).toBe(600);
    expect(d.ending[0].remainingNet).toBe(100);
  });

  it("counts a quarterly line by occurrence, not by month", () => {
    const d = derive(
      plan({
        horizon: 12,
        items: [
          item({
            id: "q",
            name: "Strom",
            kind: "expense",
            amount: 200,
            freq: "quarterly",
            first: toYM(START),
            last: toYM(START + 11),
          }),
        ],
      }),
      START,
    );
    expect(d.ending[0].paymentsLeft).toBe(4);
    expect(d.ending[0].remaining).toBe(800);
  });
});

describe("recording a month a repayment went differently", () => {
  const line = item({
    id: "phone",
    name: "Sara's phone",
    kind: "expense",
    amount: 32,
    first: toYM(START - 3),
    last: toYM(START + 20),
    reimb: { who: "Sara", amount: 20 },
  });

  it("reports what this month is due when nothing has been said", () => {
    const d = derive(plan({ horizon: 12, items: [line] }), START);
    const row = d.people[0].items[0];
    expect(row.dueThisMonth).toBe(20);
    expect(row.expectedThisMonth).toBe(20);
    expect(row.saidThisMonth).toBeNull();
  });

  it("reports nothing expected once the month is marked unpaid", () => {
    const skipped = item({
      ...line,
      reimb: { who: "Sara", amount: 20, overrides: [{ month: toYM(START), amount: 0 }] },
    });
    const d = derive(plan({ horizon: 12, items: [skipped] }), START);
    const row = d.people[0].items[0];
    expect(row.dueThisMonth).toBe(20);
    expect(row.expectedThisMonth).toBe(0);
    expect(row.saidThisMonth).toBe(0);
    expect(row.changed).toHaveLength(1);
    // and the month's forecast stops counting on it
    expect(d.months[0].reimb).toBe(0);
    expect(d.months[1].reimb).toBe(20);
  });

  it("lowers the average across the horizon rather than the per-payment figure", () => {
    const less = item({
      ...line,
      reimb: { who: "Sara", amount: 20, overrides: [{ month: toYM(START), amount: 5 }] },
    });
    const d = derive(plan({ horizon: 12, items: [less] }), START);
    expect(d.people[0].items[0].sched.amount).toBe(20);
    expect(d.people[0].monthly).toBeCloseTo((11 * 20 + 5) / 12, 6);
  });
});

describe("a pot as the source of an expense", () => {
  /* The brief's worked example: a pot funded 100 a month against 120 of
     expenses every six weeks — near enough every other month — stays positive
     because the balance carries forward. */
  const pot = {
    id: "groom",
    name: "Grooming",
    kind: "spending" as const,
    monthly: 100,
    balance: 0,
    first: toYM(START),
    last: "",
  };
  const appt = item({
    id: "appt",
    name: "Appointment",
    kind: "expense",
    amount: 120,
    freq: "quarterly",
    first: toYM(START),
    last: "",
    from: "groom",
  });

  const d = derive(plan({ horizon: 12, opening: 0, pots: [pot], items: [appt] }), START);

  it("charges the account the funding and nothing else", () => {
    // 100 a month leaves the account, every month, spent or not
    expect(d.months.every((m) => m.potFund === 100)).toBe(true);
    expect(d.months.every((m) => m.expense === 0)).toBe(true);
    expect(d.months[11].balance).toBe(-1200);
  });

  it("shows the appointment as drawn from the pot, in the months it falls", () => {
    expect(d.months[0].potSpend).toBe(120);
    expect(d.months[1].potSpend).toBe(0);
    expect(d.months[3].potSpend).toBe(120);
  });

  it("carries the balance forward rather than resetting it", () => {
    // month 0: +100 −120 = −20; month 1: +100 = 80; month 2: +100 = 180
    expect(d.potSeries.rows[0].groom).toBe(-20);
    expect(d.potSeries.rows[1].groom).toBe(80);
    expect(d.potSeries.rows[2].groom).toBe(180);
    // a year of 1200 in and 480 out
    expect(d.potSeries.ending[0]).toBeCloseTo(720, 6);
  });

  it("counts the funding, not the spending, as what a month costs", () => {
    expect(d.mPotFund).toBe(100);
    expect(d.mPotSpend).toBeCloseTo(480 / 12, 6);
    expect(d.netCost).toBe(100);
  });

  it("is not committed money, and frees up nothing when it ends", () => {
    expect(d.committed).toBe(0);
    expect(d.ending).toHaveLength(0);
  });
});

describe("a pot that is drawn on harder than it is funded", () => {
  const pot = {
    id: "groom",
    name: "Grooming",
    kind: "spending" as const,
    monthly: 50,
    balance: 0,
    first: toYM(START),
    last: "",
  };
  const appt = item({
    id: "appt",
    name: "Appointment",
    kind: "expense",
    amount: 120,
    first: toYM(START),
    last: "",
    from: "groom",
  });

  const d = derive(plan({ horizon: 12, pots: [pot], items: [appt] }), START);

  it("is called out as running dry", () => {
    expect(d.potRows[0].short).toBe(true);
    expect(d.potsShort.map((p) => p.id)).toEqual(["groom"]);
    expect(d.potRows[0].low).toBeCloseTo(-840, 6);
  });

  it("says how far short the funding is each month", () => {
    expect(d.potRows[0].slack).toBeCloseTo(-70, 6);
  });
});

describe("a pot drawn on both ways at once", () => {
  it("counts scheduled expenses and logged purchases against the same balance", () => {
    const pot = {
      id: "food",
      name: "Food",
      kind: "spending" as const,
      monthly: 400,
      balance: 0,
      first: toYM(START),
      last: "",
    };
    const sub = item({
      id: "box",
      name: "Veg box",
      kind: "expense",
      amount: 60,
      first: toYM(START),
      last: "",
      from: "food",
    });
    const d = derive(
      plan({
        horizon: 12,
        pots: [pot],
        items: [sub],
        purchases: [{ id: "a", potId: "food", date: `${toYM(START)}-09`, note: "Billa", amount: 90 }],
      }),
      START,
    );
    const row = d.potRows[0];
    expect(row.allocated).toBe(400);
    expect(row.drawn).toBe(60);
    expect(row.spent).toBe(150);
    expect(row.left).toBe(250);
    expect(row.draws.map((i) => i.id)).toEqual(["box"]);
    expect(row.purchases).toHaveLength(1);
  });
});

describe("a pot draw and a fund draw are never confused", () => {
  it("lists each in its own place, and neither in both", () => {
    const d = derive(
      plan({
        horizon: 12,
        pots: [
          {
            id: "food",
            name: "Food",
            kind: "spending",
            monthly: 400,
            balance: 0,
            first: toYM(START),
            last: "",
          },
        ],
        assets: [{ id: "house", name: "House pot", kind: "savings", value: 9000, rate: 0 }],
        items: [
          item({ id: "box", name: "Veg box", kind: "expense", amount: 60, first: toYM(START), from: "food" }),
          item({ id: "roof", name: "Roof", kind: "expense", amount: 500, first: toYM(START), from: "house" }),
        ],
      }),
      START,
    );
    const m = d.months[0];
    // the pot draw is counted as pot spending only
    expect(m.potSpend).toBe(60);
    // the fund draw is on the spends list only
    expect(m.spends.map((x) => x.id)).toEqual(["roof"]);
    expect(m.fromSavings).toBe(500);
    // and neither reaches the account
    expect(m.expense).toBe(0);
    expect(m.balance).toBe(-400);
  });
});

describe("marking this month on Paid back to me", () => {
  const line = item({
    id: "phone",
    name: "Sara's phone",
    kind: "expense",
    amount: 32,
    first: toYM(START - 3),
    last: toYM(START + 20),
    reimb: { who: "Sara", amount: 20 },
  });

  it("shows a month as settled without moving a figure", () => {
    const confirmed = item({
      ...line,
      reimb: { who: "Sara", amount: 20, paid: [toYM(START)] },
    });
    const d = derive(plan({ horizon: 12, items: [confirmed] }), START);
    const row = d.people[0].items[0];
    expect(row.paidThisMonth).toBe(true);
    expect(row.expectedThisMonth).toBe(20);
    expect(d.months[0].reimb).toBe(20);
  });

  it("empties this month and doubles the next when it is held over", () => {
    const held = item({
      ...line,
      reimb: { who: "Sara", amount: 20, deferred: [toYM(START)] },
    });
    const d = derive(plan({ horizon: 12, items: [held] }), START);
    const row = d.people[0].items[0];
    expect(row.deferredThisMonth).toBe(true);
    expect(row.expectedThisMonth).toBe(0);
    expect(d.months[0].reimb).toBe(0);
    expect(d.months[1].reimb).toBe(40);
    // the person's total is unchanged — it only arrives later
    expect(d.people[0].monthly).toBeCloseTo(20, 6);
  });

  it("tells the receiving month what was held over into it", () => {
    const held = item({
      ...line,
      reimb: { who: "Sara", amount: 20, deferred: [toYM(START - 1)] },
    });
    const d = derive(plan({ horizon: 12, items: [held] }), START);
    const row = d.people[0].items[0];
    expect(row.carriedThisMonth).toBe(20);
    expect(row.expectedThisMonth).toBe(40);
  });
});

describe("a repayment settled ahead of time", () => {
  /* The whole point: paying early must not make the thing cost more or less,
     because nothing about the agreement changed. */
  const phone = (advances: { month: string; amount: number }[]) =>
    item({
      id: "phone",
      name: "Sara's phone",
      kind: "expense",
      amount: 105,
      first: toYM(START),
      last: toYM(START + 11),
      reimb: { who: "Sara", amount: 105, advances },
    });

  it("leaves the cost exactly where it was", () => {
    const asAgreed = derive(plan({ horizon: 12, items: [phone([])] }), START);
    const prepaid = derive(
      plan({ horizon: 12, items: [phone([{ month: toYM(START + 2), amount: 1050 }])] }),
      START,
    );
    expect(prepaid.netCost).toBeCloseTo(asAgreed.netCost, 6);
    expect(prepaid.netCost).toBe(0);
    expect(prepaid.people[0].outstanding).toBe(asAgreed.people[0].outstanding);
    expect(prepaid.people[0].monthly).toBeCloseTo(asAgreed.people[0].monthly, 6);
  });

  it("moves only when the money lands, not how much of it there is", () => {
    const d = derive(
      plan({ horizon: 12, items: [phone([{ month: toYM(START + 2), amount: 1050 }])] }),
      START,
    );
    expect(d.months[1].reimb).toBe(105);
    expect(d.months[2].reimb).toBe(1050);
    expect(d.months[3].reimb).toBe(0);
    // and the year still nets to nothing
    expect(d.months.reduce((s, m) => s + m.reimb - m.expense, 0)).toBeCloseTo(0, 6);
  });

  it("shows what is still covered as credit on the person's card", () => {
    const d = derive(
      plan({ horizon: 12, items: [phone([{ month: toYM(START - 1), amount: 315 }])] }),
      START,
    );
    // she paid three months up front, one of which is already used
    expect(d.people[0].items[0].credit).toBe(210);
  });

  it("frees up the same amount when the contract ends, prepaid or not", () => {
    const asAgreed = derive(plan({ horizon: 12, items: [phone([])] }), START);
    const prepaid = derive(
      plan({ horizon: 12, items: [phone([{ month: toYM(START + 2), amount: 1050 }])] }),
      START,
    );
    expect(prepaid.ending[0].remaining).toBe(asAgreed.ending[0].remaining);
    expect(prepaid.ending[0].remainingNet).toBe(asAgreed.ending[0].remainingNet);
  });
});

