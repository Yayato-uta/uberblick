import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Asset, Item, Kind, Pot } from "../types";
import { FREQ, KIND } from "../lib/constants";
import { eur } from "../lib/format";
import { fromYM, longLabel, monthlyEquivalent } from "../lib/month";
import { Btn, Empty, IconBtn, TEXT, cx } from "../components/ui";

const ORDER: Kind[] = ["income", "expense", "saving"];

export function Items({
  items,
  pots,
  assets,
  start,
  onAdd,
  onEdit,
  onDelete,
}: {
  items: Item[];
  pots: Pot[];
  assets: Asset[];
  start: number;
  onAdd: () => void;
  onEdit: (it: Item) => void;
  onDelete: (it: Item) => void;
}) {
  return (
    <div className="mt-6">
      <div className="mb-4">
        <Btn tone="solid" onClick={onAdd}>
          <Plus size={14} /> Add a line
        </Btn>
      </div>

      {items.length === 0 && (
        <Empty
          title="Nothing here yet"
          hint="Start with your rent and your salary — the rest is easier once those two are in."
        />
      )}

      {ORDER.map((kind) => {
        const rows = items.filter((i) => i.kind === kind);
        if (!rows.length) return null;
        const tone = KIND[kind].tone === "red" ? "red" : KIND[kind].tone === "green" ? "green" : "blue";
        return (
          <section key={kind} className="mb-6">
            <h2
              className={cx(
                "mb-2 border-b border-rule pb-1 font-mono text-xs uppercase tracking-widest",
                TEXT[tone],
              )}
            >
              {KIND[kind].label} · {rows.length}
            </h2>
            <div className="space-y-px">
              {rows.map((it) => (
                <Row
                  key={it.id}
                  it={it}
                  source={
                    pots.find((p) => p.id === it.from) ?? assets.find((a) => a.id === it.from)
                  }
                  start={start}
                  tone={tone}
                  onEdit={() => onEdit(it)}
                  onDelete={() => onDelete(it)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Row({
  it,
  source,
  start,
  tone,
  onEdit,
  onDelete,
}: {
  it: Item;
  /** the pot or fund it comes out of, when it isn't the account */
  source: Pot | Asset | undefined;
  start: number;
  tone: "red" | "green" | "blue";
  onEdit: () => void;
  onDelete: () => void;
}) {
  const lastIdx = fromYM(it.last);
  const done = lastIdx !== null && lastIdx < start;
  const perMonth = monthlyEquivalent(it.amount, it.freq);

  return (
    /* Three fixed columns, never wrapping: a name that grows, then the figure
       and the actions. Wrapping made the amounts land at a different x on
       every row, which in a design that lives on aligned figures reads as a
       fault rather than as a layout. */
    <div className={cx("u-card flex items-start gap-2 px-3 py-3 sm:gap-3", done && "opacity-45")}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{it.name}</div>
        <div className="mt-0.5 font-mono text-xs text-soft">
          {it.cat} · {FREQ[it.freq].label.toLowerCase()}
          {lastIdx !== null && (
            <>
              {" "}
              · {done ? "finished" : "last"} {longLabel(lastIdx)}
            </>
          )}
        </div>
        {(it.reimb || source) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {it.reimb && (
              <span className="border border-ochre px-1.5 py-0.5 font-mono text-2xs text-ochre">
                {it.reimb.who} sends back {eur(it.reimb.amount)}
              </span>
            )}
            {source && (
              <span className="border border-green px-1.5 py-0.5 font-mono text-2xs text-green">
                paid from {source.name}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
        <div className={cx("whitespace-nowrap font-mono text-sm tabular-nums", TEXT[tone])}>
          {eur(it.amount, 2)}
        </div>
        {it.freq !== "monthly" && it.freq !== "oneoff" && (
          <div className="whitespace-nowrap font-mono text-xs text-soft">
            = {eur(perMonth)}/mo
          </div>
        )}
      </div>

      <div className="flex shrink-0">
        <IconBtn onClick={onEdit} title="Edit" aria-label={`Edit ${it.name}`}>
          <Pencil size={16} />
        </IconBtn>
        <IconBtn tone="red" onClick={onDelete} title="Delete" aria-label={`Delete ${it.name}`}>
          <Trash2 size={16} />
        </IconBtn>
      </div>
    </div>
  );
}
