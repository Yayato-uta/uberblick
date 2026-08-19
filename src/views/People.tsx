import type { Derived, PersonItem } from "../lib/derive";
import { FREQ } from "../lib/constants";
import { eur } from "../lib/format";
import { fromYM, longLabel } from "../lib/month";
import { BORDER_T, Empty, Figure, Prose, cx } from "../components/ui";

export function People({ d }: { d: Derived }) {
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
                <ItemLine key={it.id} it={it} />
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
function ItemLine({ it }: { it: PersonItem }) {
  const { sched, stop } = it;

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
    </div>
  );
}
