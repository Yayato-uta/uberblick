import { useState } from "react";
import { Check, Plus, Wallet, X } from "lucide-react";
import type { Goal } from "../types";
import type { Derived, GoalRow } from "../lib/derive";
import { eur, parsePos } from "../lib/format";
import { longLabel, toYM } from "../lib/month";
import { MonthField } from "../components/MonthField";
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

export function Goals({
  d,
  onAdd,
  onRemove,
  onFund,
  onSpend,
}: {
  d: Derived;
  onAdd: (g: Omit<Goal, "id">) => void;
  onRemove: (id: string) => void;
  onFund: (g: GoalRow) => void;
  onSpend: (id: string, spend: string) => void;
}) {
  return (
    <div className="mt-6">
      <Prose>
        Put in the dates and <em>your share</em> of the cost — not the whole cost, if somebody is
        splitting it with you. The monthly figure is worked backwards from the deadline across
        whatever window you give it, so it's the real number rather than a round one. Goals that
        start later don't touch your money until they do.
      </Prose>

      <GoalForm start={d.start} onAdd={onAdd} />

      {d.goalRows.length === 0 && (
        <Empty
          title="Nothing on the horizon yet"
          hint="A wedding, a trip, a deposit — anything with a date attached."
        />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {d.goalRows.map((g) => (
          <GoalCard
            key={g.id}
            g={g}
            leftover={d.leftover}
            onRemove={() => onRemove(g.id)}
            onFund={() => onFund(g)}
            onSpend={(m) => onSpend(g.id, m)}
          />
        ))}
      </div>

      {(d.goalsToFund > 0 || d.goalsLater > 0) && (
        <div className="mt-4 border-2 border-ink bg-card p-4">
          {d.goalsToFund > 0 && (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Label>Starting now, all goals together</Label>
                <div className="text-sm text-soft">
                  Against {eur(d.leftover)} spare each month.{" "}
                  {d.goalsToFund > d.leftover
                    ? "More than you have — something has to give."
                    : `You'd have ${eur(d.leftover - d.goalsToFund)} left over on top.`}
                </div>
              </div>
              <Figure value={eur(d.goalsToFund)} tone={d.goalsToFund > d.leftover ? "red" : "ink"} />
            </div>
          )}
          {d.goalsLater > 0 && (
            <div
              className={cx(
                "flex flex-wrap items-end justify-between gap-4",
                d.goalsToFund > 0 && "mt-4 border-t border-dashed border-rule pt-4",
              )}
            >
              <div>
                <Label>Waiting in the wings</Label>
                <div className="text-sm text-soft">
                  Kicks in later, once the goals above have run their course.
                </div>
              </div>
              <Figure value={eur(d.goalsLater)} tone="soft" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GoalCard({
  g,
  leftover,
  onRemove,
  onFund,
  onSpend,
}: {
  g: GoalRow;
  leftover: number;
  onRemove: () => void;
  onFund: () => void;
  onSpend: (spend: string) => void;
}) {
  const tight = !g.later && g.perMonth > leftover;
  const spending = g.spendIdx !== null;
  const tone: Tone = spending
    ? "green"
    : g.inPlan
      ? "blue"
      : g.later
        ? "soft"
        : tight
          ? "red"
          : "ochre";

  return (
    <div className={cx("u-card border-t-4 p-4", BORDER_T[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-xl">{g.name}</h2>
          <div className="mt-0.5 font-mono text-xs text-soft">
            {g.byIdx === null ? (
              "no date set"
            ) : (
              <>
                {g.later ? longLabel(g.fromIdx) : "now"} → {longLabel(g.byIdx)} · {g.monthsLeft}{" "}
                months of saving
              </>
            )}
          </div>
        </div>
        <IconBtn tone="red" onClick={onRemove} aria-label={`Remove ${g.name}`}>
          <X size={16} />
        </IconBtn>
      </div>

      {g.later && (
        <div className="mt-2 inline-block border border-rule px-1.5 py-0.5 font-mono text-xs uppercase tracking-widest text-soft">
          starts {longLabel(g.fromIdx)}
        </div>
      )}

      <div className="mt-4 flex items-end justify-between gap-4 border-t border-rule pt-3">
        <div>
          <Label>Your share</Label>
          <div className="font-mono text-lg">{eur(g.target)}</div>
          {g.saved > 0 && (
            <div className="font-mono text-xs text-green">{eur(g.saved)} already put by</div>
          )}
        </div>
        <div className="text-right">
          <Label>Needs per month</Label>
          <Figure value={eur(g.perMonth)} tone={g.later && !g.inPlan ? "ink" : tone} size="text-2xl" />
        </div>
      </div>

      <div className="mt-3 border-t border-dashed border-rule pt-3 text-xs text-soft">
        {g.inPlan ? (
          <>
            In your plan from {longLabel(g.fromIdx)} as a monthly saving of{" "}
            <span className="font-mono">{eur(g.planned)}</span> — already counted in every figure on
            Overview.
          </>
        ) : g.later ? (
          <>
            Nothing leaves your account until {longLabel(g.fromIdx)}, so it doesn't compete with
            anything you're saving for now.
          </>
        ) : tight ? (
          <>
            That's more than the {eur(leftover)} you have spare each month. A later date, a smaller
            share, or a bigger split would close it.
          </>
        ) : (
          <>
            Leaves <span className="font-mono">{eur(leftover - g.perMonth)}</span> of your monthly
            slack if you start now.
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!g.inPlan && (
          <Btn onClick={onFund}>
            <Plus size={13} /> Put it in the plan
          </Btn>
        )}
        {!spending && (
          <Btn onClick={() => onSpend(toYM(g.byIdx ?? g.fromIdx))}>
            <Wallet size={13} /> Spend it when it's due
          </Btn>
        )}
      </div>

      {spending && (
        <div className="mt-3 border-t border-dashed border-rule pt-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Paid for out of the pot</Label>
            <IconBtn tone="red" onClick={() => onSpend("")} aria-label="Not spending it after all">
              <X size={14} />
            </IconBtn>
          </div>
          <div className="mt-1">
            <MonthField
              value={toYM(g.spendIdx!)}
              onChange={onSpend}
              label="Month the pot is spent"
            />
          </div>
          <p className="mt-2 flex gap-1.5 text-xs text-soft">
            <Check size={13} className="mt-0.5 shrink-0 text-green" aria-hidden />
            <span>
              <span className="font-mono">{eur(g.target)}</span>{" "}
              {g.spentAlready ? "went" : "goes"} on the thing itself in{" "}
              {longLabel(g.spendIdx!)}. It shows in that month but leaves your balance alone — the
              money went out of your account month by month on the way in.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function GoalForm({ start, onAdd }: { start: number; onAdd: (g: Omit<Goal, "id">) => void }) {
  const empty = {
    name: "",
    target: "",
    from: toYM(start),
    by: toYM(start + 12),
    saved: "",
  };
  const [g, setG] = useState(empty);
  const set = (patch: Partial<typeof empty>) => setG((p) => ({ ...p, ...patch }));

  const submit = () => {
    if (!g.name.trim() || parsePos(g.target) <= 0) return;
    onAdd({
      name: g.name.trim(),
      target: parsePos(g.target),
      from: g.from,
      by: g.by,
      saved: parsePos(g.saved),
    });
    setG(empty);
  };

  return (
    <div className="u-card mb-4 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="What for">
          <TextInput
            value={g.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Wedding, honeymoon…"
          />
        </Field>
        <Field label="Your share of the cost (€)">
          <TextInput
            inputMode="decimal"
            value={g.target}
            onChange={(e) => set({ target: e.target.value })}
            placeholder="0"
          />
        </Field>
        <Field label="Start saving">
          <MonthField value={g.from} onChange={(v) => set({ from: v })} label="Start saving" />
        </Field>
        <Field label="Needed by">
          <MonthField value={g.by} onChange={(v) => set({ by: v })} label="Needed by" />
        </Field>
        <Field label="Already put by (€)">
          <TextInput
            inputMode="decimal"
            value={g.saved}
            onChange={(e) => set({ saved: e.target.value })}
            placeholder="0"
          />
        </Field>
      </div>
      <div className="mt-3">
        <Btn tone="solid" onClick={submit}>
          <Plus size={13} /> Add a goal
        </Btn>
      </div>
    </div>
  );
}

