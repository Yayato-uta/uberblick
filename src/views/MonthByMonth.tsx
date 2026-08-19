import { useEffect, useRef } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Repeat, Zap } from "lucide-react";
import type { Item } from "../types";
import type { Derived } from "../lib/derive";
import { FREQ } from "../lib/constants";
import { eur } from "../lib/format";
import { fromYM, fullLabel, occursIn } from "../lib/month";
import { reimbInMonth, reimbSchedule } from "../lib/reimb";
import { BORDER_T, Empty, Stat, TEXT, cx, type Tone } from "../components/ui";

export function MonthByMonth({
  d,
  k,
  setK,
}: {
  d: Derived;
  k: number;
  setK: (k: number) => void;
}) {
  const idx = Math.min(Math.max(0, k), d.months.length - 1);
  const M = d.months[idx];
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(`[data-k="${idx}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [idx]);

  const exp = M.hits.filter((i) => i.kind === "expense");
  const every = exp.filter((i) => i.freq === "monthly");
  const periodic = exp.filter((i) => ["quarterly", "semiannual", "yearly"].includes(i.freq));
  const once = exp.filter((i) => i.freq === "oneoff");
  const income = M.hits.filter((i) => i.kind === "income");
  const saving = M.hits.filter((i) => i.kind === "saving");

  const yours = M.expense - M.reimb;
  /* Repayments run on their own clock, so a month can take back more than it
     paid out — the share is capped for the bar, and read differently below. */
  const share = M.expense > 0 ? (M.reimb / M.expense) * 100 : 0;
  const barShare = Math.min(100, Math.max(0, share));
  const overCovered = yours < -0.5;
  const irregularYours = [...periodic, ...once].reduce(
    (s, i) => s + (occursIn(i, M.idx) ? i.amount : 0) - reimbInMonth(i, M.idx),
    0,
  );

  return (
    <div className="mt-6">
      {/* month picker */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setK(Math.max(0, idx - 1))}
          disabled={idx === 0}
          aria-label="Previous month"
          className="flex min-h-touch min-w-touch items-center justify-center border border-rule text-ink disabled:opacity-30"
        >
          <ChevronLeft size={18} />
        </button>
        <div ref={strip} className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
          {d.months.map((m, i) => (
            <button
              key={m.idx}
              data-k={i}
              onClick={() => setK(i)}
              aria-current={i === idx ? "true" : undefined}
              className={cx(
                "min-h-touch whitespace-nowrap border px-3 py-2 font-mono text-xs",
                i === idx ? "border-ink bg-ink text-card" : "border-rule bg-card text-soft",
              )}
            >
              {m.name}
            </button>
          ))}
        </div>
        <button
          onClick={() => setK(Math.min(d.months.length - 1, idx + 1))}
          disabled={idx === d.months.length - 1}
          aria-label="Next month"
          className="flex min-h-touch min-w-touch items-center justify-center border border-rule text-ink disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <h2 className="mb-3 font-mono text-2xl">{fullLabel(M.idx)}</h2>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Leaves your account"
          value={eur(M.expense)}
          tone="soft"
          note="Every expense that hits this month, before anyone pays you back."
        />
        <Stat
          label="Carried for other people"
          value={eur(M.reimb)}
          tone="ochre"
          note={
            overCovered
              ? "More comes back this month than goes out."
              : `${Math.round(barShare)}% of the outflow isn't really your expense.`
          }
        />
        <Stat
          label="Actually your expense"
          value={eur(yours)}
          tone={overCovered ? "green" : "red"}
          note={
            overCovered
              ? "Repayments outrun the bills — the month pays you."
              : "What this month genuinely costs you."
          }
        />
        <Stat
          label="Ends the month"
          value={eur(M.net)}
          tone={M.net < 0 ? "red" : "green"}
          note={`Balance lands at ${eur(M.balance)}.`}
        />
      </div>

      {/* whose money is it */}
      {M.expense > 0 && (
        <div className="mb-6">
          <div className="flex h-5 w-full border border-rule">
            <div className="bg-red opacity-75" style={{ width: `${100 - barShare}%` }} />
            <div className="bg-ochre opacity-75" style={{ width: `${barShare}%` }} />
          </div>
          <div className="mt-1 flex justify-between font-mono text-xs text-soft">
            <span>
              <span className={overCovered ? "text-green" : "text-red"}>▬</span> yours{" "}
              {eur(yours)}
            </span>
            <span>
              <span className="text-ochre">▬</span> passing through {eur(M.reimb)}
            </span>
          </div>
        </div>
      )}

      {exp.length === 0 && (
        <div className="mb-4">
          <Empty title="No expenses land in this month" />
        </div>
      )}

      <BreakdownGroup
        title="Every month"
        note="the baseline you pay no matter what"
        rows={every}
        idx={M.idx}
        icon={Repeat}
        tone="red"
      />
      <BreakdownGroup
        title="Periodic — falls due this month"
        note="recurring, but not every month"
        rows={periodic}
        idx={M.idx}
        icon={CalendarClock}
        tone="ochre"
      />
      <BreakdownGroup
        title="One-time only"
        note="happens once and never again"
        rows={once}
        idx={M.idx}
        icon={Zap}
        tone="blue"
      />

      {(income.length > 0 || saving.length > 0) && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {income.length > 0 && (
            <SimpleList
              title={`Money in · ${income.length}`}
              tone="green"
              rows={income}
              totalLabel="Total in"
              total={M.income + M.reimb}
            />
          )}
          {saving.length > 0 && (
            <SimpleList
              title={`Moved into savings · ${saving.length}`}
              tone="blue"
              rows={saving}
              totalLabel="Total set aside"
              total={M.saving}
            />
          )}
        </div>
      )}

      {M.interest > 0.5 && (
        <div className="mt-4 border border-dashed border-red bg-card px-4 py-3 text-sm text-red">
          Plus {eur(M.interest, 2)} of overdraft interest this month — not in any group above, but
          it leaves all the same.
        </div>
      )}

      {periodic.length + once.length > 0 && (
        <div className="u-card mt-4 px-4 py-3 text-sm text-soft">
          <span className="font-mono text-ink">{eur(M.irregular)}</span> of this month's outflow is
          the non-monthly kind. A normal month without it costs you{" "}
          <span className="font-mono text-ink">{eur(yours - irregularYours)}</span>.
        </div>
      )}
    </div>
  );
}

/* ── one expense group, with its three columns ── */

function BreakdownGroup({
  title,
  note,
  rows,
  idx,
  icon: Icon,
  tone,
}: {
  title: string;
  note?: string;
  rows: Item[];
  /** absolute month index — a row may be here for a repayment alone */
  idx: number;
  icon: typeof Repeat;
  tone: Tone;
}) {
  if (!rows.length) return null;
  const gross = rows.reduce((s, i) => s + (occursIn(i, idx) ? i.amount : 0), 0);
  const back = rows.reduce((s, i) => s + reimbInMonth(i, idx), 0);

  return (
    <div className={cx("u-card mb-4 border-t-4", BORDER_T[tone])}>
      <div className="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-2">
        <Icon size={14} className={TEXT[tone]} aria-hidden />
        <span className={cx("font-mono text-xs uppercase tracking-widest", TEXT[tone])}>
          {title} · {rows.length}
        </span>
        {note && <span className="text-xs text-soft">{note}</span>}
      </div>

      {/* column heads — the stacked mobile rows carry their own labels instead */}
      <div className="hidden gap-3 border-b border-rule px-3 py-1 font-mono text-xs uppercase tracking-widest text-soft sm:flex">
        <span className="flex-1">Item</span>
        <span className="w-24 text-right">Leaves</span>
        <span className="w-24 text-right">Comes back</span>
        <span className="w-24 text-right">Yours</span>
      </div>

      {rows.map((it) => (
        <BreakdownRow key={it.id} it={it} idx={idx} />
      ))}

      <div className="bg-paper px-3 py-2 sm:flex sm:gap-3">
        <span className="u-label flex-1">Group total</span>
        <div className="mt-1 grid grid-cols-3 gap-2 font-mono text-sm tabular-nums sm:mt-0 sm:flex sm:gap-3">
          <span className="w-full text-right text-soft sm:w-24">
            {gross > 0 ? eur(gross, 2) : "—"}
          </span>
          <span className={cx("w-full text-right sm:w-24", back > 0 ? "text-ochre" : "text-rule")}>
            {back > 0 ? `−${eur(back, 2)}` : "—"}
          </span>
          <span
            className={cx(
              "w-full text-right sm:w-24",
              gross - back > 0.01 ? "text-red" : "text-soft",
            )}
          >
            {eur(gross - back, 2)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* A repayment runs on its own clock, so a line can be here with money coming
   back and nothing going out — a one-off paid months ago, still being repaid. */
function BreakdownRow({ it, idx }: { it: Item; idx: number }) {
  const due = occursIn(it, idx);
  const back = reimbInMonth(it, idx);
  const gross = due ? it.amount : 0;
  const yours = gross - back;
  const full = back > 0 && yours <= 0.01;
  const sched = reimbSchedule(it);
  const lump = !!sched && sched.extras.some((e) => fromYM(e.month) === idx);

  return (
    <div className="border-b border-rule px-3 py-2 sm:flex sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          {it.name}
          {!due && <span className="font-mono text-xs text-ochre"> · repayment only</span>}
        </div>
        <div className="font-mono text-xs text-soft">
          {it.cat}
          {back > 0 && (
            <span className="text-ochre">
              {" "}
              · {full ? "fully" : "partly"} covered by {sched!.who}
              {lump ? " (lump sum this month)" : ""}
            </span>
          )}
        </div>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2 sm:mt-0 sm:flex sm:gap-3">
        <Cell label="Leaves" value={due ? eur(gross, 2) : "—"} tone={due ? "soft" : "rule"} />
        <Cell
          label="Comes back"
          value={back > 0 ? `−${eur(back, 2)}` : "—"}
          tone={back > 0 ? "ochre" : "rule"}
        />
        <Cell
          label="Yours"
          value={Math.abs(yours) <= 0.01 ? "€0" : eur(yours, 2)}
          tone={yours > 0.01 ? "red" : "soft"}
        />
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="text-right sm:w-24">
      <span className="u-label block sm:hidden">{label}</span>
      <span className={cx("font-mono text-sm tabular-nums", TEXT[tone])}>{value}</span>
    </div>
  );
}

function SimpleList({
  title,
  tone,
  rows,
  totalLabel,
  total,
}: {
  title: string;
  tone: Tone;
  rows: Item[];
  totalLabel: string;
  total: number;
}) {
  return (
    <div className={cx("u-card border-t-4", BORDER_T[tone])}>
      <div
        className={cx(
          "border-b border-rule px-3 py-2 font-mono text-xs uppercase tracking-widest",
          TEXT[tone],
        )}
      >
        {title}
      </div>
      {rows.map((i) => (
        <div key={i.id} className="flex justify-between gap-3 border-b border-rule px-3 py-2 text-sm">
          <span>
            {i.name}
            {i.freq !== "monthly" && (
              <span className="font-mono text-xs text-soft"> · {FREQ[i.freq].label.toLowerCase()}</span>
            )}
          </span>
          <span className={cx("font-mono tabular-nums", TEXT[tone])}>{eur(i.amount, 2)}</span>
        </div>
      ))}
      <div className="flex justify-between bg-paper px-3 py-2 font-mono text-sm">
        <span className="u-label">{totalLabel}</span>
        <span className={TEXT[tone]}>{eur(total, 2)}</span>
      </div>
    </div>
  );
}
