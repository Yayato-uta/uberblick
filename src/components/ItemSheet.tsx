import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import type { Freq, Item, Kind } from "../types";
import { CATEGORIES, FREQ, KIND } from "../lib/constants";
import { parsePos, uid } from "../lib/format";
import { nowIdx, toYM } from "../lib/month";
import { Btn, Checkbox, Field, Label, Select, TextInput } from "./ui";
import { MonthField } from "./MonthField";
import { Sheet } from "./Sheet";

export interface ItemDraft {
  id: string | null;
  name: string;
  kind: Kind;
  cat: string;
  amount: string;
  freq: Freq;
  first: string;
  last: string;
  reimbOn: boolean;
  reimbWho: string;
  reimbAmount: string;
  /* the repayment keeps its own clock — blank dates follow the expense */
  reimbFreq: Freq;
  reimbFirst: string;
  reimbLast: string;
  extras: { month: string; amount: string }[];
}

export const blankDraft = (): ItemDraft => ({
  id: null,
  name: "",
  kind: "expense",
  cat: "Home",
  amount: "",
  freq: "monthly",
  first: toYM(nowIdx()),
  last: "",
  reimbOn: false,
  reimbWho: "",
  reimbAmount: "",
  reimbFreq: "monthly",
  reimbFirst: "",
  reimbLast: "",
  extras: [],
});

export const draftFromItem = (it: Item): ItemDraft => ({
  id: it.id,
  name: it.name,
  kind: it.kind,
  cat: it.cat,
  amount: String(it.amount),
  freq: it.freq,
  first: it.first,
  last: it.last,
  reimbOn: !!it.reimb,
  reimbWho: it.reimb?.who ?? "",
  reimbAmount: it.reimb ? String(it.reimb.amount) : "",
  reimbFreq: it.reimb?.freq ?? it.freq,
  reimbFirst: it.reimb?.first || it.first,
  reimbLast: it.reimb?.last ?? "",
  extras: (it.reimb?.extras ?? []).map((e) => ({ month: e.month, amount: String(e.amount) })),
});

export function ItemSheet({
  draft,
  onSave,
  onClose,
}: {
  draft: ItemDraft | null;
  onSave: (item: Item) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<ItemDraft>(draft ?? blankDraft());
  const [touched, setTouched] = useState(false);

  // re-seed whenever a different row is opened
  const [seed, setSeed] = useState(draft);
  if (draft !== seed) {
    setSeed(draft);
    setF(draft ?? blankDraft());
    setTouched(false);
  }

  if (!draft) return null;

  const set = (patch: Partial<ItemDraft>) => setF((p) => ({ ...p, ...patch }));

  const nameOk = f.name.trim().length > 0;
  const amountOk = parsePos(f.amount) > 0;

  const submit = () => {
    setTouched(true);
    if (!nameOk || !amountOk) return;
    const item: Item = {
      id: f.id ?? uid(),
      name: f.name.trim(),
      kind: f.kind,
      cat: f.cat,
      amount: parsePos(f.amount),
      freq: f.freq,
      first: f.first,
      last: f.last || "",
    };
    if (f.reimbOn && f.kind === "expense") {
      const amount = parsePos(f.reimbAmount);
      const extras = f.extras
        .map((e) => ({ month: e.month, amount: parsePos(e.amount) }))
        .filter((e) => e.month && e.amount > 0);
      // lump sums alone are a repayment too, so don't require an instalment
      if (amount > 0 || extras.length > 0) {
        item.reimb = {
          who: f.reimbWho.trim() || "Someone",
          amount,
          freq: f.reimbFreq,
          first: f.reimbFirst || f.first,
          last: f.reimbLast,
          extras,
        };
      }
    }
    onSave(item);
  };

  return (
    <Sheet
      open
      title={f.id ? "Edit this line" : "Add a line"}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Btn tone="solid" onClick={submit} className="flex-1 sm:flex-none">
            <Check size={14} />
            {f.id ? "Save changes" : "Add to plan"}
          </Btn>
          <Btn onClick={onClose} className="flex-1 sm:flex-none">
            Cancel
          </Btn>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="What is it"
          wide
          hint={touched && !nameOk ? <span className="text-red">Give it a name.</span> : undefined}
        >
          <TextInput
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Rent, phone, loan…"
            autoFocus
          />
        </Field>

        <Field label="Money direction">
          <Select value={f.kind} onChange={(e) => set({ kind: e.target.value as Kind })}>
            {(Object.keys(KIND) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND[k].label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Group">
          <Select value={f.cat} onChange={(e) => set({ cat: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>

        <Field
          label="Amount each time (€)"
          hint={
            touched && !amountOk ? (
              <span className="text-red">Put in what leaves the account each time.</span>
            ) : undefined
          }
        >
          <TextInput
            inputMode="decimal"
            value={f.amount}
            onChange={(e) => set({ amount: e.target.value })}
            placeholder="0"
          />
        </Field>

        <Field label="How often">
          <Select value={f.freq} onChange={(e) => set({ freq: e.target.value as Freq })}>
            {(Object.keys(FREQ) as Freq[]).map((k) => (
              <option key={k} value={k}>
                {FREQ[k].label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="First payment" hint="Everything after it counts from here.">
          <MonthField
            value={f.first}
            onChange={(v) => set({ first: v })}
            label="First payment"
          />
        </Field>

        <Field label="Last payment" hint="Leave it open if there's no end in sight.">
          <MonthField
            value={f.last}
            onChange={(v) => set({ last: v })}
            allowEmpty
            emptyLabel="Ongoing — no end"
            label="Last payment"
          />
        </Field>
      </div>

      {f.kind === "expense" && (
        <div className="mt-5 border-t border-dashed border-rule pt-4">
          <Checkbox
            checked={f.reimbOn}
            onChange={(v) =>
              setF((p) => ({
                ...p,
                reimbOn: v,
                reimbAmount: p.reimbAmount || p.amount,
                reimbFirst: p.reimbFirst || p.first,
              }))
            }
          >
            Someone pays me back for this
          </Checkbox>

          {f.reimbOn && (
            <>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Who pays me back">
                  <TextInput
                    value={f.reimbWho}
                    onChange={(e) => set({ reimbWho: e.target.value })}
                    placeholder="Partner, housemate…"
                  />
                </Field>
                <Field
                  label="How much they send each time (€)"
                  hint="Put the full amount here if they cover all of it."
                >
                  <TextInput
                    inputMode="decimal"
                    value={f.reimbAmount}
                    onChange={(e) => set({ reimbAmount: e.target.value })}
                    placeholder="0"
                  />
                </Field>

                <Field
                  label="How often they pay me"
                  hint="Needn't match the bill — a one-off can come back monthly."
                >
                  <Select
                    value={f.reimbFreq}
                    onChange={(e) => set({ reimbFreq: e.target.value as Freq })}
                  >
                    {(Object.keys(FREQ) as Freq[]).map((k) => (
                      <option key={k} value={k}>
                        {FREQ[k].label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="hidden sm:block" />

                <Field label="First repayment" hint="Leave it to follow the bill's own start.">
                  <MonthField
                    value={f.reimbFirst}
                    onChange={(v) => set({ reimbFirst: v })}
                    allowEmpty
                    emptyLabel="Same as the bill"
                    label="First repayment"
                  />
                </Field>

                <Field
                  label="Last repayment"
                  hint="Set it earlier than the bill's end if their share stops first."
                >
                  <MonthField
                    value={f.reimbLast}
                    onChange={(v) => set({ reimbLast: v })}
                    allowEmpty
                    emptyLabel="Same as the bill"
                    label="Last repayment"
                  />
                </Field>
              </div>

              <div className="mt-4 border-t border-dotted border-rule pt-3">
                <Label>Extra lump sums on top</Label>
                <p className="mb-2 text-xs text-soft">
                  One-off payments outside the regular rate — a bonus put toward it, say.
                </p>

                {f.extras.map((e, i) => (
                  <div key={i} className="mb-2 flex items-end gap-2">
                    <div className="flex-1">
                      <MonthField
                        value={e.month}
                        onChange={(v) =>
                          set({ extras: f.extras.map((x, j) => (j === i ? { ...x, month: v } : x)) })
                        }
                        label="Lump sum month"
                      />
                    </div>
                    <div className="flex-1">
                      <TextInput
                        inputMode="decimal"
                        value={e.amount}
                        placeholder="€"
                        aria-label="Lump sum amount"
                        onChange={(ev) =>
                          set({
                            extras: f.extras.map((x, j) =>
                              j === i ? { ...x, amount: ev.target.value } : x,
                            ),
                          })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => set({ extras: f.extras.filter((_, j) => j !== i) })}
                      aria-label="Remove this lump sum"
                      className="flex min-h-touch min-w-touch items-center justify-center border border-rule text-red"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

                <Btn
                  onClick={() =>
                    set({ extras: [...f.extras, { month: f.reimbFirst || f.first, amount: "" }] })
                  }
                >
                  <Plus size={12} /> Add a lump sum
                </Btn>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

