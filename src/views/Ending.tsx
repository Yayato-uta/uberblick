import { TrendingDown, TrendingUp } from "lucide-react";
import type { Derived } from "../lib/derive";
import { eur } from "../lib/format";
import { longLabel } from "../lib/month";
import { BORDER_T, Empty, Figure, Label, Prose, TEXT, cx } from "../components/ui";

export function Ending({ d }: { d: Derived }) {
  return (
    <div className="mt-6">
      <CostRises d={d} />

      <div className="mb-3 mt-8 flex items-center gap-2">
        <TrendingDown size={16} className={TEXT.green} aria-hidden />
        <h2 className={cx("font-mono text-sm uppercase tracking-widest", TEXT.green)}>
          Payments finish
        </h2>
      </div>

      <Prose>
        Everything with a final payment date, soonest first. The right column is what actually frees
        up — for anything somebody repays you right to the end, freeing it up changes nothing in
        your pocket.
      </Prose>

      {d.ending.length === 0 && (
        <Empty
          title="No end dates set"
          hint={'Add a "last payment" month to any financing or loan and it\'ll show up here.'}
        />
      )}

      <div className="space-y-px">
        {d.ending.map((it) => (
          <div key={it.id} className="u-card flex flex-wrap items-center gap-4 px-4 py-4">
            <div className="min-w-[4.5rem] text-center font-mono">
              <div className="text-2xl leading-none">{it.monthsLeft}</div>
              <div className="text-xs uppercase tracking-widest text-soft">months</div>
            </div>

            <div className="min-w-[10rem] flex-1">
              <div className="font-medium">{it.name}</div>
              <div className="mt-0.5 font-mono text-xs text-soft">
                final payment {longLabel(it.lastIdx)} · {eur(it.perMonth)}/mo out
              </div>
            </div>

            <div className="text-right">
              <Figure
                value={it.net > 0.5 ? `+${eur(it.net)}` : "±€0"}
                tone={it.net > 0.5 ? "green" : "soft"}
                size="text-xl"
              />
              <div className="font-mono text-xs text-soft">
                {it.net > 0.5
                  ? "free per month after"
                  : `${it.reimb?.who ?? "somebody"} was covering it`}
              </div>
            </div>
          </div>
        ))}
      </div>

      {d.ending.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-between gap-4 border-2 border-ink bg-card p-4">
          <div>
            <Label>Once everything above is paid off</Label>
            <div className="text-sm text-soft">Money genuinely back in your pocket each month.</div>
          </div>
          <Figure value={`+${eur(d.freedTotal)}`} tone="green" />
        </div>
      )}
    </div>
  );
}

/**
 * The mirror image of the list below, and the one that matters more: the direct
 * debit carries on, the money coming back does not.
 */
function CostRises({ d }: { d: Derived }) {
  if (d.costRises.length === 0) return null;

  return (
    <div className={cx("u-card border-t-4", BORDER_T.red)}>
      <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
        <TrendingUp size={16} className={TEXT.red} aria-hidden />
        <span className={cx("font-mono text-sm uppercase tracking-widest", TEXT.red)}>
          Cost goes up · {d.costRises.length}
        </span>
      </div>

      <p className="border-b border-rule px-4 py-3 text-sm text-soft">
        Somebody's repayments stop before your payments do. Nothing changes on the bill — it simply
        becomes yours.
      </p>

      {d.costRises.map((it) => (
        <div key={it.id} className="flex flex-wrap items-center gap-4 border-b border-rule px-4 py-4">
          <div className="min-w-[4.5rem] text-center font-mono">
            <div className="text-2xl leading-none text-red">{Math.max(0, it.monthsUntil)}</div>
            <div className="text-xs uppercase tracking-widest text-soft">months</div>
          </div>

          <div className="min-w-[10rem] flex-1">
            <div className="font-medium">{it.name}</div>
            <div className="mt-0.5 font-mono text-xs text-soft">
              {it.who} stops after {longLabel(it.rEnd)} ·{" "}
              {it.iEnd === null
                ? "this bill has no end date"
                : `you pay on to ${longLabel(it.iEnd)}`}
            </div>
          </div>

          <div className="text-right">
            <Figure value={`−${eur(it.perMonth)}`} tone="red" size="text-xl" />
            <div className="font-mono text-xs text-soft">
              {it.iEnd === null
                ? "a month, from then on"
                : `a month · ${eur(it.total)} over ${it.n} payment${it.n === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
