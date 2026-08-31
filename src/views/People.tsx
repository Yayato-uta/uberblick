import { useState } from "react";
import { Check, CornerDownRight, X } from "lucide-react";
import type { Derived, PersonItem } from "../lib/derive";
import { FREQ } from "../lib/constants";
import { eur, parsePos } from "../lib/format";
import { fromYM, longLabel, toYM } from "../lib/month";
import { BORDER_T, Btn, Empty, Figure, Prose, TextInput, cx } from "../components/ui";

export function People({
  d,
  onSetMonth,
  onSetPaid,
  onSetDeferred,
}: {
  d: Derived;
  /** record what one repayment did in one month; null puts the agreement back */
  onSetMonth: (itemId: string, month: string, amount: number | null) => void;
  /** tick a month off as actually received */
  onSetPaid: (itemId: string, month: string, on: boolean) => void;
  /** push a month's instalment into the next month */
  onSetDeferred: (itemId: string, month: string, on: boolean) => void;
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
                  onSetPaid={onSetPaid}
                  onSetDeferred={onSetDeferred}
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
  onSetPaid,
  onSetDeferred,
}: {
  it: PersonItem;
  who: string;
  month: string;
  monthIdx: number;
  onSetMonth: (itemId: string, month: string, amount: number | null) => void;
  onSetPaid: (itemId: string, month: string, on: boolean) => void;
  onSetDeferred: (itemId: string, month: string, on: boolean) => void;
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
            <div>
              <div className="font-mono text-xs text-soft">
                {longLabel(monthIdx)}:{" "}
                {it.saidThisMonth !== null ? (
                  it.saidThisMonth > 0 ? (
                    <span className="text-ochre">
                      {eur(it.saidThisMonth)} instead of {eur(it.dueThisMonth)}
                    </span>
                  ) : (
                    <span className="text-red">nothing this month</span>
                  )
                ) : it.deferredThisMonth ? (
                  <span className="text-ochre">
                    moved to {longLabel(monthIdx + 1)} — {eur(it.dueThisMonth)} on top of next
                    month's
                  </span>
                ) : it.paidThisMonth ? (
                  <span className="text-green">{eur(it.expectedThisMonth)} paid ✓</span>
                ) : (
                  <span className="text-ink">{eur(it.expectedThisMonth)} due</span>
                )}
                {it.carriedThisMonth > 0 && !it.deferredThisMonth && (
                  <span className="text-soft">
                    {" "}
                    (incl. {eur(it.carriedThisMonth)} held over)
                  </span>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap gap-1">
                {it.saidThisMonth !== null || it.deferredThisMonth || it.paidThisMonth ? (
                  <Btn
                    onClick={() => {
                      if (it.saidThisMonth !== null) onSetMonth(it.id, month, null);
                      if (it.deferredThisMonth) onSetDeferred(it.id, month, false);
                      if (it.paidThisMonth) onSetPaid(it.id, month, false);
                    }}
                  >
                    Undo
                  </Btn>
                ) : (
                  <>
                    <Btn tone="solid" onClick={() => onSetPaid(it.id, month, true)}>
                      <Check size={12} /> Paid
                    </Btn>
                    <Btn onClick={() => onSetDeferred(it.id, month, true)}>
                      <CornerDownRight size={12} /> Next month
                    </Btn>
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
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
