import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Pot, PotKind, Purchase } from "../types";
import type { Derived, PotRow } from "../lib/derive";
import { eur, parseNum, parsePos } from "../lib/format";
import { fullLabel, toYM } from "../lib/month";
import { MonthField } from "../components/MonthField";
import { Sheet } from "../components/Sheet";
import {
  BORDER_T,
  Btn,
  Callout,
  Empty,
  Field,
  Figure,
  IconBtn,
  Label,
  Prose,
  Select,
  Stat,
  TextInput,
  cx,
  type Tone,
} from "../components/ui";
import { POT_KINDS } from "../lib/constants";
import { eurAxis } from "../lib/format";
import { usePalette } from "../hooks/useTheme";
import { useIsNarrow } from "../hooks/useMediaQuery";
import { AlertTriangle } from "lucide-react";

/** "YYYY-MM-DD" for today, in local time — not UTC, which can be yesterday. */
function todayISO(): string {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** "3 Aug" — enough to place a purchase without the noise of a full date. */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[(m || 1) - 1]}`;
}

export function Pots({
  d,
  onStep,
  onAddPot,
  onEditPot,
  onDropPot,
  onSpend,
  onDropPurchase,
}: {
  d: Derived;
  /** move the pot month, +1 or -1 */
  onStep: (delta: number) => void;
  onAddPot: (p: Omit<Pot, "id">) => void;
  onEditPot: (id: string, patch: Partial<Pot>) => void;
  onDropPot: (p: PotRow) => void;
  onSpend: (p: Omit<Purchase, "id">) => void;
  onDropPurchase: (p: Purchase) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PotRow | null>(null);
  const thisMonth = d.potMonthIdx === d.start;
  const P = usePalette();
  const narrow = useIsNarrow();
  // same six-label ceiling as the other charts
  const tickInterval = narrow
    ? d.horizon > 18
      ? 3
      : d.horizon > 12
        ? 2
        : 1
    : d.horizon > 18
      ? 1
      : 0;

  return (
    <div className="mt-6">
      <Prose>
        A pot is an envelope inside your money. It's funded from your account every month, keeps
        whatever it doesn't spend, and can be named as the source of an expense over in All items.
        The funding is what shows in your cash flow — anything paid out of a pot has already left
        the account on the way in, so it never counts twice.
      </Prose>

      {/* which month the figures describe */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => onStep(-1)}
          aria-label="Previous month"
          className="flex min-h-touch min-w-touch items-center justify-center border border-rule text-ink"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <div className="font-mono text-lg">{fullLabel(d.potMonthIdx)}</div>
          {!thisMonth && (
            <button
              onClick={() => onStep(d.start - d.potMonthIdx)}
              className="u-label min-h-touch px-2 underline"
            >
              back to this month
            </button>
          )}
        </div>
        <button
          onClick={() => onStep(1)}
          aria-label="Next month"
          className="flex min-h-touch min-w-touch items-center justify-center border border-rule text-ink"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {d.potsShort.length > 0 && (
        <div className="mb-4">
          <Callout tone="red" dashed icon={AlertTriangle}>
            {d.potsShort.map((p) => p.name).join(", ")}{" "}
            {d.potsShort.length === 1 ? "runs" : "run"} dry inside the next {d.horizon} months —
            more is drawn out than funded in. Raise the monthly funding, or move something back to
            the account.
          </Callout>
        </div>
      )}

      {d.potRows.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat
            label="Funded each month"
            value={eur(d.potAllocated)}
            tone="ochre"
            note="What leaves the account into pots."
          />
          <Stat
            label="Spent from pots"
            value={eur(d.potSpent)}
            tone="green"
            note="Already funded — it doesn't touch the account again."
          />
          <Stat
            label="Sitting in pots today"
            value={eur(d.potsToday)}
            tone="ink"
            note="Yours, but earmarked."
          />
        </div>
      )}

      <div className="mb-4">
        <Btn tone="solid" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add a pot
        </Btn>
      </div>

      {d.potRows.length === 0 && (
        <Empty
          title="No pots yet"
          hint="Start with the one you think about most — groceries, eating out, petrol."
        />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {d.potRows.map((p) => (
          <PotCard
            key={p.id}
            p={p}
            monthIdx={d.potMonthIdx}
            onSpend={onSpend}
            onEdit={() => setEditing(p)}
            onDrop={() => onDropPot(p)}
            onDropPurchase={onDropPurchase}
          />
        ))}
      </div>

      {d.potRows.length > 0 && (
        <div className="u-card mt-4 p-3 sm:p-4">
          <Label>How the pots stand over {d.horizon} months</Label>
          <div className="mt-2 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.potSeries.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={P.rule} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fontFamily: "monospace", fill: P.soft }}
                  axisLine={{ stroke: P.rule }}
                  tickLine={false}
                  interval={tickInterval}
                />
                <YAxis
                  tick={{ fontSize: 10, fontFamily: "monospace", fill: P.soft }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={eurAxis}
                />
                <Tooltip
                  formatter={(v: number) => eur(v)}
                  contentStyle={{
                    background: P.card,
                    border: `1px solid ${P.rule}`,
                    borderRadius: 0,
                    fontFamily: "monospace",
                    fontSize: 12,
                    color: P.ink,
                  }}
                />
                {/* a pot below this line is being drawn on harder than it is funded */}
                <ReferenceLine y={0} stroke={P.ink} strokeWidth={1} />
                {d.potRows.map((p) => (
                  <Line
                    key={p.id}
                    type="monotone"
                    dataKey={p.id}
                    name={p.name}
                    stroke={P[POT_KINDS[p.kind].tone]}
                    strokeWidth={p.short ? 2.5 : 1.5}
                    strokeDasharray={p.short ? "4 3" : undefined}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-soft">
            {d.potRows.map((p) => (
              <span key={p.id}>
                <span style={{ color: P[POT_KINDS[p.kind].tone] }}>▬</span> {p.name}
                {p.short && <span className="text-red"> · runs dry</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {d.potRows.length > 1 && (
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-2 border-ink bg-card p-4">
          <div>
            <Label>All pots this month</Label>
            <div className="text-sm text-soft">
              {eur(d.potAllocated)} set aside, {eur(d.potSpent)} spent.
            </div>
          </div>
          <div className="text-right">
            <Figure value={eur(d.potLeft)} tone={d.potLeft < 0 ? "red" : "green"} />
            <div className="u-label">still in the pots</div>
          </div>
        </div>
      )}

      <PotSheet
        open={adding}
        start={d.start}
        onClose={() => setAdding(false)}
        onSave={(p) => {
          onAddPot(p);
          setAdding(false);
        }}
      />
      <PotSheet
        open={!!editing}
        start={d.start}
        pot={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSave={(p) => {
          if (editing) onEditPot(editing.id, p);
          setEditing(null);
        }}
      />
    </div>
  );
}

/* ── one pot ── */

function PotCard({
  p,
  monthIdx,
  onSpend,
  onEdit,
  onDrop,
  onDropPurchase,
}: {
  p: PotRow;
  monthIdx: number;
  onSpend: (x: Omit<Purchase, "id">) => void;
  onEdit: () => void;
  onDrop: () => void;
  onDropPurchase: (x: Purchase) => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [dating, setDating] = useState(false);
  const [open, setOpen] = useState(false);

  const tone: Tone = p.over || p.short ? "red" : p.left < p.allocated * 0.2 ? "ochre" : "green";

  const add = () => {
    const value = parsePos(amount);
    if (value <= 0) return;
    onSpend({ potId: p.id, date, note: note.trim(), amount: value });
    setAmount("");
    setNote("");
    setDate(todayISO());
    setDating(false);
  };

  return (
    <div className={cx("u-card border-t-4 p-4", BORDER_T[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-mono text-xl">{p.name}</h2>
          <div className="mt-0.5 font-mono text-xs text-soft">
            {POT_KINDS[p.kind].label} ·{" "}
            {p.funded ? `${eur(p.monthly)} a month` : "not funded this month"}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconBtn onClick={onEdit} title="Edit" aria-label={`Edit ${p.name}`}>
            <Pencil size={16} />
          </IconBtn>
          <IconBtn tone="red" onClick={onDrop} title="Delete" aria-label={`Delete ${p.name}`}>
            <Trash2 size={16} />
          </IconBtn>
        </div>
      </div>

      {/* the number that matters */}
      <div className="mt-4 flex items-end justify-between gap-4 border-t border-rule pt-3">
        <div>
          <Label>Still in the pot</Label>
          <Figure value={eur(p.left)} tone={p.over ? "red" : "green"} size="text-3xl" />
        </div>
        <div className="text-right font-mono text-xs text-soft">
          <div>
            {eur(p.carriedIn)} carried in
            {p.carriedIn > 0.005 && <span className="text-green"> ↻</span>}
          </div>
          <div>+ {eur(p.allocated)} this month</div>
          <div className="border-t border-rule pt-0.5">− {eur(p.spent)} spent</div>
        </div>
      </div>

      {p.draws.length > 0 && (
        <div className="mt-3 border-t border-dotted border-rule pt-2">
          <Label>Paid out of it</Label>
          {p.draws.map((it) => (
            <div key={it.id} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{it.name}</span>
              <span className="font-mono tabular-nums text-soft">{eur(it.amount, 2)}</span>
            </div>
          ))}
        </div>
      )}

      {(p.draws.length > 0 || p.short) && (
        <div className={cx("mt-2 font-mono text-xs", p.short ? "text-red" : "text-soft")}>
          {p.slack < -0.005 ? (
            /* genuinely underfunded: no starting balance would save it */
            <>
              {eur(-p.slack)} a month short of what comes out of it — it only gets deeper.
            </>
          ) : p.short ? (
            /* the funding covers it on average; the bills just land too early */
            <>
              The funding covers it on average, with {eur(p.slack)} a month to spare, but a bill
              lands before enough has built up — it dips to {eur(p.low)}. Starting it with{" "}
              {eur(-p.low)} would carry it.
            </>
          ) : (
            <>{eur(p.slack)} a month of slack after what comes out of it.</>
          )}
        </div>
      )}

      <div className="mt-2 flex h-3 w-full border border-rule" aria-hidden>
        <div
          className={cx(p.over ? "bg-red" : "bg-ochre", "opacity-75")}
          style={{ width: `${p.usedPct}%` }}
        />
      </div>
      <div className="mt-1 font-mono text-xs text-soft">
        {p.over ? (
          <span className="text-red">
            {eur(-p.left)} over — it comes out of next month's allocation.
          </span>
        ) : (
          `${eur(p.spent)} of ${eur(p.available)} used`
        )}
      </div>

      {/* log a purchase — the one thing done often, so it stays two taps */}
      <div className="mt-4 border-t border-dashed border-rule pt-3">
        <Label>Bought something out of it</Label>
        <div className="mt-1 flex gap-2">
          <div className="w-24 shrink-0">
            <TextInput
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="€"
              aria-label={`Amount spent from ${p.name}`}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
          </div>
          <TextInput
            className="min-w-0 flex-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What for"
            aria-label={`What the ${p.name} spend was for`}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>

        <div className="mt-2 flex items-center gap-2">
          {dating ? (
            <input
              type="date"
              value={date}
              autoFocus
              onChange={(e) => setDate(e.target.value)}
              onBlur={() => setDating(false)}
              aria-label="Date of the purchase"
              className="u-input min-h-touch min-w-0 flex-1 font-mono text-sm"
            />
          ) : (
            <button
              onClick={() => setDating(true)}
              className="min-h-touch flex-1 text-left font-mono text-xs text-soft underline"
            >
              {date === todayISO() ? "today" : dayLabel(date)} · change
            </button>
          )}
          <Btn tone="solid" onClick={add}>
            <Plus size={13} /> Add
          </Btn>
        </div>
      </div>

      {/* what went out */}
      {p.purchases.length > 0 && (
        <div className="mt-3 border-t border-rule pt-2">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="u-label flex min-h-touch w-full items-center text-left underline"
          >
            {p.purchases.length} purchase{p.purchases.length === 1 ? "" : "s"} in{" "}
            {fullLabel(monthIdx)} {open ? "▴" : "▾"}
          </button>
          {open && (
            <div className="mt-1">
              {p.purchases.map((x) => (
                <div
                  key={x.id}
                  className="flex items-center gap-2 border-b border-rule py-1.5 text-sm last:border-0"
                >
                  <span className="w-14 shrink-0 font-mono text-xs text-soft">
                    {dayLabel(x.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{x.note || "—"}</span>
                  <span className="font-mono tabular-nums">{eur(x.amount, 2)}</span>
                  <IconBtn
                    tone="red"
                    onClick={() => onDropPurchase(x)}
                    aria-label={`Remove ${x.note || "purchase"}`}
                  >
                    <X size={14} />
                  </IconBtn>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── add / edit a pot ── */

function PotSheet({
  open,
  pot,
  start,
  onSave,
  onClose,
}: {
  open: boolean;
  pot?: Pot;
  start: number;
  onSave: (p: Omit<Pot, "id">) => void;
  onClose: () => void;
}) {
  const blank = {
    name: "",
    kind: "spending" as PotKind,
    monthly: "",
    first: toYM(start),
    last: "",
    balance: "",
  };
  const seeded = pot
    ? {
        name: pot.name,
        kind: pot.kind,
        monthly: String(pot.monthly),
        first: pot.first,
        last: pot.last,
        balance: String(pot.balance),
      }
    : blank;

  const [f, setF] = useState(seeded);
  const [seed, setSeed] = useState(pot);
  const [touched, setTouched] = useState(false);
  if (pot !== seed) {
    setSeed(pot);
    setF(seeded);
    setTouched(false);
  }

  if (!open) return null;
  const set = (patch: Partial<typeof blank>) => setF((p) => ({ ...p, ...patch }));
  const nameOk = f.name.trim().length > 0;
  const monthlyOk = parsePos(f.monthly) > 0;

  const submit = () => {
    setTouched(true);
    if (!nameOk || !monthlyOk) return;
    onSave({
      name: f.name.trim(),
      kind: f.kind,
      monthly: parsePos(f.monthly),
      balance: parseNum(f.balance),
      first: f.first,
      last: f.last,
    });
  };

  return (
    <Sheet
      open
      title={pot ? "Edit this pot" : "Add a pot"}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Btn tone="solid" onClick={submit} className="flex-1 sm:flex-none">
            {pot ? "Save changes" : "Add the pot"}
          </Btn>
          <Btn onClick={onClose} className="flex-1 sm:flex-none">
            Cancel
          </Btn>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="What's it for"
          wide
          hint={touched && !nameOk ? <span className="text-red">Give it a name.</span> : undefined}
        >
          <TextInput
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Groceries, eating out, petrol…"
            autoFocus
          />
        </Field>

        <Field
          label="Set aside each month (€)"
          hint={
            touched && !monthlyOk ? (
              <span className="text-red">Put in what you budget each month.</span>
            ) : undefined
          }
        >
          <TextInput
            inputMode="decimal"
            value={f.monthly}
            onChange={(e) => set({ monthly: e.target.value })}
            placeholder="300"
          />
        </Field>

        <Field label="In the pot today (€)" hint="What's sitting there now, before this month's money.">
          <TextInput
            inputMode="decimal"
            value={f.balance}
            onChange={(e) => set({ balance: e.target.value })}
            placeholder="0"
          />
        </Field>

        <Field label="What kind" hint={POT_KINDS[f.kind].note}>
          <Select value={f.kind} onChange={(e) => set({ kind: e.target.value as PotKind })}>
            {(Object.keys(POT_KINDS) as PotKind[]).map((k) => (
              <option key={k} value={k}>
                {POT_KINDS[k].label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Funded from" hint="The first month you put money in.">
          <MonthField value={f.first} onChange={(v) => set({ first: v })} label="Funded from" />
        </Field>

        <Field label="Funded until" hint="Leave it open if it just keeps going.">
          <MonthField
            value={f.last}
            onChange={(v) => set({ last: v })}
            allowEmpty
            emptyLabel="Ongoing — no end"
            label="Funded until"
          />
        </Field>
      </div>
    </Sheet>
  );
}
