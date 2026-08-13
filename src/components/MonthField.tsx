import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { MONTHS, fromYM, longLabel, month0, nowIdx, toYM, year } from "../lib/month";
import { Btn, cx } from "./ui";
import { Sheet } from "./Sheet";

/**
 * iOS Safari renders `<input type="month">` as a bare text box with no picker,
 * so every month field in the app is this instead.
 */
export function MonthField({
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = "Ongoing — no end",
  label = "Pick a month",
}: {
  value: string;
  onChange: (ym: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const idx = fromYM(value);
  const [draftYear, setDraftYear] = useState(() => year(idx ?? nowIdx()));

  const show = () => {
    setDraftYear(year(fromYM(value) ?? nowIdx()));
    setOpen(true);
  };

  const pick = (m: number) => {
    onChange(toYM(draftYear * 12 + m));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="u-input flex min-h-touch items-center justify-between gap-2 text-left"
      >
        <span className={idx === null ? "text-soft" : undefined}>
          {idx === null ? emptyLabel : longLabel(idx)}
        </span>
        <CalendarDays size={15} className="shrink-0 text-soft" aria-hidden />
      </button>

      <Sheet open={open} title={label} onClose={() => setOpen(false)} width="max-w-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setDraftYear((y) => y - 1)}
            className="flex min-h-touch min-w-touch items-center justify-center border border-rule text-ink"
            aria-label="Previous year"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="font-mono text-2xl tabular-nums">{draftYear}</div>
          <button
            type="button"
            onClick={() => setDraftYear((y) => y + 1)}
            className="flex min-h-touch min-w-touch items-center justify-center border border-rule text-ink"
            aria-label="Next year"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-px bg-rule">
          {MONTHS.map((m, i) => {
            const selected = idx !== null && year(idx) === draftYear && month0(idx) === i;
            const isNow = nowIdx() === draftYear * 12 + i;
            return (
              <button
                key={m}
                type="button"
                onClick={() => pick(i)}
                className={cx(
                  "flex min-h-[3.25rem] items-center justify-center font-mono text-sm uppercase tracking-widest",
                  selected ? "bg-ink text-card" : "bg-card text-ink",
                  !selected && isNow && "underline decoration-dotted underline-offset-4",
                )}
              >
                {m}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Btn
            onClick={() => {
              onChange(toYM(nowIdx()));
              setOpen(false);
            }}
          >
            This month
          </Btn>
          {allowEmpty && (
            <Btn
              tone="ghost"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {emptyLabel}
            </Btn>
          )}
        </div>
      </Sheet>
    </>
  );
}
