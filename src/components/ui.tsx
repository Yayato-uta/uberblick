import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import type { LucideIcon } from "lucide-react";

/* Tone names map to literal Tailwind classes so the scanner can see them.
   Colour is semantic here: red is always money leaving or a limit breached. */
export type Tone = "ink" | "soft" | "red" | "green" | "blue" | "ochre" | "rule";

export const TEXT: Record<Tone, string> = {
  ink: "text-ink",
  soft: "text-soft",
  red: "text-red",
  green: "text-green",
  blue: "text-blue",
  ochre: "text-ochre",
  rule: "text-rule",
};

export const BORDER: Record<Tone, string> = {
  ink: "border-ink",
  soft: "border-soft",
  red: "border-red",
  green: "border-green",
  blue: "border-blue",
  ochre: "border-ochre",
  rule: "border-rule",
};

/* Side-specific so a coloured edge doesn't repaint the other three. */
export const BORDER_L: Record<Tone, string> = {
  ink: "border-l-ink",
  soft: "border-l-soft",
  red: "border-l-red",
  green: "border-l-green",
  blue: "border-l-blue",
  ochre: "border-l-ochre",
  rule: "border-l-rule",
};

export const BORDER_T: Record<Tone, string> = {
  ink: "border-t-ink",
  soft: "border-t-soft",
  red: "border-t-red",
  green: "border-t-green",
  blue: "border-t-blue",
  ochre: "border-t-ochre",
  rule: "border-t-rule",
};

export const BG: Record<Tone, string> = {
  ink: "bg-ink",
  soft: "bg-soft",
  red: "bg-red",
  green: "bg-green",
  blue: "bg-blue",
  ochre: "bg-ochre",
  rule: "bg-rule",
};

export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

/* ── type ── */

export function Label({
  children,
  as = "div",
  htmlFor,
}: {
  children: ReactNode;
  as?: "div" | "span" | "label";
  htmlFor?: string;
}) {
  const Tag = as;
  return (
    <Tag className="u-label mb-1 block" htmlFor={htmlFor}>
      {children}
    </Tag>
  );
}

export function Figure({
  value,
  tone = "ink",
  size = "text-3xl",
}: {
  value: ReactNode;
  tone?: Tone;
  size?: string;
}) {
  return (
    <div className={cx("font-mono tabular-nums tracking-[-0.02em]", size, TEXT[tone])}>{value}</div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-mono text-base uppercase tracking-widest sm:text-lg">{children}</h2>
      {right}
    </div>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <p className="mb-5 max-w-2xl text-sm text-soft">{children}</p>;
}

/* ── boxes ── */

export function Stat({
  label,
  value,
  note,
  tone = "ink",
  icon: Icon,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  return (
    <div className="u-card flex flex-col justify-between p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <Label>{label}</Label>
        {Icon && <Icon size={15} className={cx("shrink-0", TEXT[tone])} aria-hidden />}
      </div>
      <Figure value={value} tone={tone} size="text-2xl sm:text-3xl" />
      {note && <div className="mt-2 text-xs leading-snug text-soft">{note}</div>}
    </div>
  );
}

export function Panel({
  children,
  accent,
  className,
}: {
  children: ReactNode;
  accent?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cx("u-card p-4", accent && `border-l-4 ${BORDER_L[accent]}`, className)}
    >
      {children}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="border border-dashed border-rule bg-card p-8 text-center sm:p-10">
      <div className="font-mono text-sm uppercase tracking-widest">{title}</div>
      {hint && <div className="mx-auto mt-2 max-w-md text-sm text-soft">{hint}</div>}
    </div>
  );
}

export function Callout({
  tone = "ochre",
  icon: Icon,
  children,
  dashed,
  onClose,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  dashed?: boolean;
  onClose?: () => void;
}) {
  return (
    <div
      className={cx(
        "flex items-start gap-3 bg-card px-4 py-3 text-sm",
        dashed ? "border border-dashed" : "border-2",
        BORDER[tone],
        TEXT[tone],
      )}
      role="status"
    >
      {Icon && <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />}
      <div className="flex-1">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="-my-2 -mr-2 inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center hover:opacity-60"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ── controls ── */

type BtnTone = "solid" | "ghost" | "danger";

export function Btn({
  children,
  tone = "ghost",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: BtnTone }) {
  const tones: Record<BtnTone, string> = {
    solid: "bg-ink text-card border border-ink",
    ghost: "bg-transparent text-ink border border-rule",
    danger: "bg-transparent text-red border border-rule",
  };
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex min-h-touch items-center justify-center gap-2 px-3 py-2 font-mono text-xs uppercase tracking-widest transition-opacity hover:opacity-70 disabled:opacity-30",
        tones[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconBtn({
  children,
  tone = "soft",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex min-h-touch min-w-touch items-center justify-center p-2 hover:opacity-60 disabled:opacity-30",
        TEXT[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A labelled control. The label is tied to the control it wraps, so a screen
 * reader announces "Amount each time" rather than an unnamed text box, and
 * tapping the words puts the cursor in the field.
 */
export function Field({
  label,
  children,
  hint,
  wide,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  /* Fields hold one control. Give it the id the label points at, unless it
     brought its own or isn't a plain element (MonthField opens a sheet). */
  const kids = Children.toArray(children);
  const only = kids.length === 1 ? kids[0] : null;
  const control =
    only !== null && isValidElement<{ id?: string }>(only) && only.props.id === undefined
      ? cloneElement(only, { id })
      : children;
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Label as="label" htmlFor={id}>
        {label}
      </Label>
      {control}
      {hint && <div className="mt-1 text-xs text-soft">{hint}</div>}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} {...rest} className={cx("u-input", className)} />;
  },
);

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx("u-input", className)}>
      {children}
    </select>
  );
}

/**
 * A numeric field that lets you type. It tolerates "", a lone "-" and a
 * half-finished "-12," without snapping the value back under your fingers.
 */
export function NumInput({
  value,
  onChange,
  className,
  allowNegative = true,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  allowNegative?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(() => String(value ?? 0));
  const focused = useRef(false);

  // follow the value when it changes elsewhere (import, reset) but never while typing
  useEffect(() => {
    if (!focused.current) setText(String(value ?? 0));
  }, [value]);

  const handle = (raw: string) => {
    setText(raw);
    const n = parseFloat(raw.replace(",", "."));
    if (Number.isFinite(n)) onChange(allowNegative ? n : Math.abs(n));
    else if (raw === "" || raw === "-") onChange(0);
  };

  return (
    <input
      aria-label={ariaLabel}
      // "text" rather than "decimal" so the minus key is reachable on a phone
      inputMode={allowNegative ? "text" : "decimal"}
      className={cx("u-input", className)}
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => handle(e.target.value)}
      onBlur={() => {
        focused.current = false;
        setText(String(value ?? 0));
      }}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
  tone = "ochre",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        "flex min-h-touch items-center gap-2 font-mono text-xs uppercase tracking-widest",
        checked ? TEXT[tone] : "text-soft",
      )}
    >
      <span
        className={cx(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center border",
          checked ? BORDER[tone] : "border-rule",
        )}
      >
        {checked && <span className="block h-2.5 w-2.5" style={{ background: "currentColor" }} />}
      </span>
      {children}
    </button>
  );
}

/** A flat two-part bar: how much of a limit is used. */
export function Meter({
  fraction,
  tone = "ochre",
  height = "h-4",
}: {
  fraction: number;
  tone?: Tone;
  height?: string;
}) {
  const pctWidth = Math.min(100, Math.max(0, fraction * 100));
  return (
    <div className={cx("flex w-full border border-rule bg-field", height)}>
      <div className={BG[tone]} style={{ width: `${pctWidth}%` }} />
    </div>
  );
}
