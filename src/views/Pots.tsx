import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Pot, Purchase } from "../types";
import type { Derived, PotRow } from "../lib/derive";
import { eur, parseNum, parsePos } from "../lib/format";
import { fullLabel, toYM } from "../lib/month";
import { MonthField } from "../components/MonthField";
import { Sheet } from "../components/Sheet";
import {
  BORDER_T,
  Btn,
  Empty,
  Field,
  Figure,
  IconBtn,
  Label,
  Prose,
  TextInput,
  cx,
  type Tone,
} from "../components/ui";

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

  return (
    <div className="mt-6">
      <Prose>
        Set aside money for a category, then spend it down as you go. What you don't use stays
        put, so next month you get that on top of the new allocation. Your plan assumes the full
        amount leaves your account each month, so what's left in a pot is untouched budget — not
        spare cash in the bank.
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
            <button onClick={() => onStep(d.start - d.potMonthIdx)} className="u-label underline">
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

  const tone: Tone = p.over ? "red" : p.left < p.allocated * 0.2 ? "ochre" : "green";

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
            className="u-label w-full text-left underline"
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
    monthly: "",
    from: toYM(start),
    last: "",
    opening: "",
  };
  const seeded = pot
    ? {
        name: pot.name,
        monthly: String(pot.monthly),
        from: pot.from,
        last: pot.last,
        opening: String(pot.opening),
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
      monthly: parsePos(f.monthly),
      from: f.from,
      last: f.last,
      opening: parseNum(f.opening),
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

        <Field label="Already in it (€)" hint="What's sitting there now, before this month's money.">
          <TextInput
            inputMode="decimal"
            value={f.opening}
            onChange={(e) => set({ opening: e.target.value })}
            placeholder="0"
          />
        </Field>

        <Field label="Funded from" hint="The first month you put money in.">
          <MonthField value={f.from} onChange={(v) => set({ from: v })} label="Funded from" />
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
