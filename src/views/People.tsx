import { useState } from "react";
import { Check, X } from "lucide-react";
import type { Derived, PersonItem } from "../lib/derive";
import { FREQ } from "../lib/constants";
import { eur, parsePos } from "../lib/format";
import { fromYM, longLabel, toYM } from "../lib/month";
import { BORDER_T, Btn, Empty, Figure, Prose, TextInput, cx } from "../components/ui";

export function People({
  d,
  onSetMonth,
}: {
  d: Derived;
  /** record what one repayment did in one month; null puts the agreement back */
  onSetMonth: (itemId: string, month: string, amount: number | null) => void;
}) {
  const thisMonth = toYM(d.start);
  return (
    <div className="mt-6">
      <Prose>
        These leave your account in your name and come back to you. They shouldn't count as your
        cost — but they do count as your risk, because the bank asks you, not them. The big figure
        is an average across {d.horizon} months, so it sits below the per-payment amount whenever a
        repayment stops partway through, starts late, or doesn't arrive every month.
      </Prose>

      {d.people.length === 0 && (
        <Empty
          title="Nobody owes you anything"
          hint={'Add an expense in All items and tick "Someone pays me back for this".'}
        />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {d.people.map((p) => (
          <div key={p.who} className={cx("u-card border-t-4 p-4", BORDER_T.ochre)}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-mono text-xl">{p.who}</h2>
              <div className="text-right">
                <Figure value={eur(p.monthly)} tone="ochre" size="text-2xl" />
                <div className="font-mono text-xs text-soft">
                  average / month over {d.horizon}m
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3 border-t border-rule pt-3">
              {p.items.map((it) => (
                <ItemLine
                  key={it.id}
                  it={it}
                  who={p.who}
                  month={thisMonth}
                  monthIdx={d.start}
                  onSetMonth={onSetMonth}
                />
              ))}
            </div>

            <div className="mt-3 border-t border-dashed border-rule pt-3 text-xs text-soft">
              If {p.who} stops sending money, your own monthly cost rises by{" "}
              <span className="font-mono text-red">{eur(p.monthly)}</span>
              {p.ongoing ? "." : ` and you'd still owe ${eur(p.outstanding)} in total.`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* One item under a person: their repayment schedule on its own terms, then any
   lump sums, then — the line that matters — what you carry once they stop. */
function ItemLine({
  it,
  who,
  month,
  monthIdx,
  onSetMonth,
}: {
  it: PersonItem;
  who: string;
  month: string;
  monthIdx: number;
  onSetMonth: (itemId: string, month: string, amount: number | null) => void;
}) {
  const { sched, stop } = it;
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");

  return (
    <div className="text-sm">
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <div>{it.name}</div>
          <div className="font-mono text-xs text-soft">
            {eur(sched.amount)}{" "}
            {sched.freq === "monthly" ? "a month" : FREQ[sched.freq].label.toLowerCase()}
            {" · "}
            {stop === null
              ? "no end date set"
              : `${it.paymentsLeft} left, through ${longLabel(stop)}`}
          </div>
        </div>
        <div className="whitespace-nowrap text-right font-mono">
          {stop === null ? "ongoing" : eur(it.total)}
          <div className="text-xs text-soft">still to come</div>
        </div>
      </div>

      {it.lumps.length > 0 && (
        <div className="mt-1 font-mono text-xs text-ochre">
          {it.lumps.map((e) => `${longLabel(fromYM(e.month)!)} ${eur(e.amount)}`).join(" · ")}
          <span className="text-soft"> — lump sums on top</span>
        </div>
      )}

      {it.aloneMonths > 0 && (
        <div className="mt-1 font-mono text-xs text-red">
          They stop in {longLabel(it.stop!)} — {it.aloneMonths} payment
          {it.aloneMonths === 1 ? "" : "s"} after that are yours alone, {eur(it.alone)} in all.
        </div>
      )}

      {it.aloneOngoing && (
        <div className="mt-1 font-mono text-xs text-red">
          They stop in {longLabel(it.stop!)}, but this bill has no end — it's all yours from then
          on.
        </div>
      )}

      {it.changed.length > 0 && (
        <div className="mt-1 font-mono text-xs text-soft">
          {it.changed
            .map((c) => {
              const i = fromYM(c.month);
              const when = i === null ? c.month : longLabel(i);
              return `${when} ${c.amount > 0 ? eur(c.amount) : "nothing"}`;
            })
            .join(" · ")}
          <span> — instead of the usual</span>
        </div>
      )}

      {/* what happened this month, and a way to say otherwise */}
      {(it.dueThisMonth > 0 || it.saidThisMonth !== null) && (
        <div className="mt-2 border-t border-dotted border-rule pt-2">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="u-label">{longLabel(monthIdx)}</span>
              <div className="w-24">
                <TextInput
                  inputMode="decimal"
                  autoFocus
                  value={amount}
                  placeholder="€0"
                  aria-label={`What ${who} paid in ${longLabel(monthIdx)}`}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    onSetMonth(it.id, month, parsePos(amount));
                    setEditing(false);
                  }}
                />
              </div>
              <Btn
                tone="solid"
                onClick={() => {
                  onSetMonth(it.id, month, parsePos(amount));
                  setEditing(false);
                }}
              >
                <Check size={13} /> Save
              </Btn>
              <Btn onClick={() => setEditing(false)}>Cancel</Btn>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-soft">
                {longLabel(monthIdx)}:{" "}
                {it.saidThisMonth === null ? (
                  <span className="text-ink">{eur(it.dueThisMonth)} due</span>
                ) : it.saidThisMonth > 0 ? (
                  <span className="text-ochre">
                    {eur(it.saidThisMonth)} instead of {eur(it.dueThisMonth)}
                  </span>
                ) : (
                  <span className="text-red">nothing this month</span>
                )}
              </span>
              <div className="ml-auto flex gap-1">
                {it.saidThisMonth === null ? (
                  <>
                    <Btn onClick={() => onSetMonth(it.id, month, 0)}>
                      <X size={12} /> Didn't pay
                    </Btn>
                    <Btn
                      onClick={() => {
                        setAmount(String(it.dueThisMonth));
                        setEditing(true);
                      }}
                    >
                      Paid less
                    </Btn>
                  </>
                ) : (
                  <Btn onClick={() => onSetMonth(it.id, month, null)}>Undo</Btn>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
