import type { Derived } from "../lib/derive";
import { eur } from "../lib/format";
import { longLabel } from "../lib/month";
import { Empty, Figure, Label, Prose } from "../components/ui";

export function Ending({ d }: { d: Derived }) {
  return (
    <div className="mt-6">
      <Prose>
        Everything with a final payment date, soonest first. The right column is what actually frees
        up — for anything somebody repays you, freeing it up changes nothing in your pocket.
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
