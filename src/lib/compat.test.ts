import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { forecast } from "./forecast";
import { fromYM } from "./month";

/**
 * The guarantee this file exists for: a backup written by either single-file
 * version imports and every figure comes out the same.
 *
 * The reference implementation below is lifted verbatim from that version — the
 * month arithmetic, the repayment schedule and the forecast loop — so the ported
 * app is checked against the code that produced the owner's numbers, not against
 * a restatement of it. It is deliberately untouched, warts and all.
 */

/* ── the original, copied as it was ── */

const refFromYM = (s: string): number | null => {
  if (!s) return null;
  const [y, m] = String(s).split("-").map(Number);
  if (!y || !m) return null;
  return y * 12 + (m - 1);
};

interface RefItem {
  id: string;
  name: string;
  kind: string;
  cat: string;
  amount: number;
  freq: string;
  first: string;
  last: string;
  reimb?: {
    who: string;
    amount: number;
    freq?: string;
    first?: string;
    last?: string;
    extras?: { month: string; amount: number }[];
  };
}

function refOccursIn(item: { first: string; last: string; freq: string }, idx: number): boolean {
  const first = refFromYM(item.first);
  if (first === null || idx < first) return false;
  const last = refFromYM(item.last);
  if (last !== null && idx > last) return false;
  const d = idx - first;
  switch (item.freq) {
    case "monthly":
      return true;
    case "quarterly":
      return d % 3 === 0;
    case "semiannual":
      return d % 6 === 0;
    case "yearly":
      return d % 12 === 0;
    case "oneoff":
      return d === 0;
    default:
      return false;
  }
}

function refSched(it: RefItem) {
  const r = it.reimb;
  if (!r) return null;
  return {
    who: r.who || "Someone",
    amount: Number(r.amount) || 0,
    freq: r.freq || "monthly",
    first: r.first || it.first,
    last: r.last === undefined || r.last === "" ? it.last : r.last,
    extras: r.extras || [],
  };
}

function refReimbInMonth(it: RefItem, idx: number): number {
  const s = refSched(it);
  if (!s) return 0;
  let t = refOccursIn(s, idx) ? s.amount : 0;
  for (const e of s.extras) if (refFromYM(e.month) === idx) t += Number(e.amount) || 0;
  return t;
}

/** the original's own migration of the bare {who, amount} shape */
function refNormalise(items: RefItem[]): RefItem[] {
  return items.map((it) =>
    it.reimb && it.reimb.freq === undefined
      ? { ...it, reimb: { ...it.reimb, freq: it.freq, first: it.first, last: it.last, extras: [] } }
      : it,
  );
}

function refForecast(items: RefItem[], opening: number, odRate: number, horizon: number, start: number) {
  const rows = [];
  let bal = Number(opening) || 0;
  for (let k = 0; k < horizon; k++) {
    const idx = start + k;
    let income = 0;
    let expense = 0;
    let saving = 0;
    let reimb = 0;
    let irregular = 0;
    for (const it of items) {
      const back = it.kind === "expense" ? refReimbInMonth(it, idx) : 0;
      const due = refOccursIn(it, idx);
      if (!due && back === 0) continue;
      if (!due) {
        reimb += back;
        continue;
      }
      if (it.kind === "income") income += it.amount;
      else if (it.kind === "saving") saving += it.amount;
      else {
        expense += it.amount;
        if (it.freq !== "monthly") irregular += it.amount;
        reimb += back;
      }
    }
    let net = income + reimb - expense - saving;
    bal += net;
    const rate = (Number(odRate) || 0) / 100 / 12;
    const interest = bal < 0 ? -bal * rate : 0;
    bal -= interest;
    net -= interest;
    rows.push({ idx, income, expense, saving, reimb, irregular, interest, net, balance: Math.round(bal) });
  }
  return rows;
}

/* ── the backups ── */

/** Exported by the earliest version: bare {who, amount}, no goals or assets. */
const earlyBackup = {
  items: [
    { id: "i1", name: "Salary", kind: "income", cat: "Salary", amount: 2400, freq: "monthly", first: "2025-01", last: "" },
    { id: "i2", name: "Urlaubsgeld", kind: "income", cat: "Salary", amount: 1400, freq: "yearly", first: "2025-06", last: "" },
    { id: "i3", name: "Weihnachtsgeld", kind: "income", cat: "Salary", amount: 1400, freq: "yearly", first: "2025-11", last: "" },
    { id: "e1", name: "Miete", kind: "expense", cat: "Home", amount: 890, freq: "monthly", first: "2025-01", last: "" },
    { id: "e2", name: "Strom", kind: "expense", cat: "Utilities", amount: 210, freq: "quarterly", first: "2026-09", last: "" },
    { id: "e3", name: "Versicherung", kind: "expense", cat: "Insurance", amount: 250, freq: "yearly", first: "2026-10", last: "" },
    { id: "e4", name: "Waschmaschine", kind: "expense", cat: "Debt & financing", amount: 55, freq: "monthly", first: "2025-11", last: "2026-10" },
    { id: "e5", name: "Loan", kind: "expense", cat: "Debt & financing", amount: 320, freq: "monthly", first: "2026-03", last: "2029-03", reimb: { who: "Fiancé", amount: 320 } },
    { id: "e6", name: "Sister's phone", kind: "expense", cat: "Family", amount: 32, freq: "monthly", first: "2026-05", last: "2028-04", reimb: { who: "Sister", amount: 20 } },
    { id: "s1", name: "Sparbuch", kind: "saving", cat: "Savings", amount: 120, freq: "monthly", first: "2025-01", last: "" },
  ],
  opening: -1450,
  overdraft: 6000,
  odRate: 11.5,
  horizon: 24,
  sample: false,
};

/** Exported by the later version: repayments on their own clock, lump sums. */
const laterBackup = {
  ...earlyBackup,
  items: [
    ...earlyBackup.items.slice(0, 7),
    {
      id: "e5",
      name: "Loan",
      kind: "expense",
      cat: "Debt & financing",
      amount: 320,
      freq: "monthly",
      first: "2026-03",
      last: "2029-03",
      // their share stops well before the loan does
      reimb: { who: "Fiancé", amount: 320, freq: "monthly", first: "2026-03", last: "2027-06", extras: [] },
    },
    {
      id: "e7",
      name: "Deposit fronted",
      kind: "expense",
      cat: "Family",
      amount: 3600,
      freq: "oneoff",
      first: "2026-08",
      last: "2026-08",
      // paid out once, repaid monthly, with a lump sum dropped in at Christmas
      reimb: {
        who: "Friend",
        amount: 300,
        freq: "monthly",
        first: "2026-09",
        last: "2027-08",
        extras: [{ month: "2026-12", amount: 900 }],
      },
    },
    {
      id: "e8",
      name: "Shared car insurance",
      kind: "expense",
      cat: "Insurance",
      amount: 600,
      freq: "yearly",
      first: "2026-11",
      last: "2029-11",
      // a yearly bill settled in quarterly instalments — neither clock matches
      reimb: { who: "Sister", amount: 75, freq: "quarterly", first: "2026-12", last: "", extras: [] },
    },
    earlyBackup.items[9],
  ],
};

const START = fromYM("2026-08")!;

function compare(backup: Record<string, unknown>, label: string) {
  describe(label, () => {
    const data = migrate(JSON.parse(JSON.stringify(backup)))!;

    it("is recognised as a plan", () => {
      expect(data).not.toBeNull();
      expect(data.items).toHaveLength((backup.items as unknown[]).length);
    });

    it("keeps the account settings", () => {
      expect(data.opening).toBe(backup.opening);
      expect(data.overdraft).toBe(backup.overdraft);
      expect(data.odRate).toBe(backup.odRate);
      expect(data.horizon).toBe(backup.horizon);
    });

    for (const horizon of [12, 18, 24]) {
      it(`matches the original month for month over ${horizon} months`, () => {
        const mine = forecast({
          items: data.items,
          opening: data.opening,
          odRate: data.odRate,
          horizon,
          start: START,
        });
        const theirs = refForecast(
          refNormalise(JSON.parse(JSON.stringify(backup.items)) as RefItem[]),
          backup.opening as number,
          backup.odRate as number,
          horizon,
          START,
        );

        expect(mine).toHaveLength(theirs.length);
        mine.forEach((m, k) => {
          const t = theirs[k];
          const where = `month ${k}`;
          expect({ where, v: m.income }).toEqual({ where, v: t.income });
          expect({ where, v: m.expense }).toEqual({ where, v: t.expense });
          expect({ where, v: m.saving }).toEqual({ where, v: t.saving });
          expect({ where, v: m.reimb }).toEqual({ where, v: t.reimb });
          expect({ where, v: m.irregular }).toEqual({ where, v: t.irregular });
          expect({ where, v: m.balance }).toEqual({ where, v: t.balance });
          expect(m.interest).toBeCloseTo(t.interest, 9);
          expect(m.net).toBeCloseTo(t.net, 9);
        });
      });
    }
  });
}

compare(earlyBackup, "a backup from the earliest version");
compare(laterBackup, "a backup from the later version");
