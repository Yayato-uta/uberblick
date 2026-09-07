import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Plus,
  ScrollText,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import type { Assumptions, StockBook, StockFacts } from "../types";
import type { Movement, QualityKey, Scored, ScreenedBook, ValueKey } from "../lib/valuation";
import { asDelta, asPct, money, parseNum } from "../lib/format";
import { blankFacts } from "../lib/snapshot";
import { Sheet } from "../components/Sheet";
import {
  BORDER_L,
  Btn,
  Callout,
  Checkbox,
  Empty,
  Field,
  Figure,
  IconBtn,
  Label,
  Meter,
  NumInput,
  Panel,
  Prose,
  SectionTitle,
  Select,
  TEXT,
  TextInput,
  cx,
  type Tone,
} from "../components/ui";

/* The weekly screen.
 *
 * It shows its working on purpose. A single number saying "buy this one" would
 * be easy to read and impossible to check, and a screen nobody can check is a
 * screen nobody should act on — so every company can be opened up to the
 * yields, the three valuations and the percentile behind each part of its
 * score, and every warning is written in words rather than encoded in a
 * colour. */

const VALUE_LABELS: Record<ValueKey, string> = {
  fcfYield: "Free cash flow yield",
  earningsYield: "Earnings yield",
  ebitToEv: "Operating profit ÷ enterprise value",
  bookYield: "Book value ÷ price",
  salesYield: "Revenue ÷ price",
};

const QUALITY_LABELS: Record<QualityKey, string> = {
  roce: "Return on capital employed",
  roe: "Return on equity",
  solvency: "How little debt it carries",
  epsGrowth: "Earnings growth",
  revenueGrowth: "Revenue growth",
};

/** Green for a bargain, red for a company priced above what it looks worth. */
const scoreTone = (score: number): Tone =>
  score >= 65 ? "green" : score >= 45 ? "ochre" : "red";

export function Stocks({
  book,
  screened,
  onImport,
  onSaveFacts,
  onRemove,
  onAssumptions,
  onShortlist,
  onAuto,
}: {
  book: StockBook;
  screened: ScreenedBook;
  onImport: (file: File) => void;
  onSaveFacts: (facts: StockFacts) => void;
  onRemove: (ticker: string) => void;
  onAssumptions: (a: Assumptions) => void;
  onShortlist: (n: number) => void;
  onAuto: (on: boolean) => void;
}) {
  const [open, setOpen] = useState<Scored | null>(null);
  const [editing, setEditing] = useState<StockFacts | null>(null);
  const [settings, setSettings] = useState(false);
  const { snapshot, previous, rows, moves } = screened;

  const shortlist = rows.slice(0, book.shortlist);
  const rest = rows.slice(book.shortlist);

  return (
    <div className="mt-6">
      <SectionTitle
        right={
          <div className="flex items-center gap-1">
            <IconBtn onClick={() => setSettings(true)} aria-label="What I want out of a share">
              <SlidersHorizontal size={16} />
            </IconBtn>
            <IconBtn onClick={() => setEditing(blankFacts())} aria-label="Add a company">
              <Plus size={18} />
            </IconBtn>
          </div>
        }
      >
        {snapshot ? `Week ${snapshot.week}` : "Undervalued"}
      </SectionTitle>

      <Prose>
        Every company on the list ranked by how cheap it looks against what it earns, owns and
        brings in — then marked down for how good a business it actually is. Nothing here knows
        what a company announced this morning.
      </Prose>

      <div className="space-y-3">
        {/* Not dismissible. It is the most important thing on the screen. */}
        <Callout tone="ochre" icon={AlertTriangle}>
          This is a screen, not advice. It ranks the figures you gave it and nothing else — it
          cannot see a lawsuit, a profit warning, an accounting fraud or a sector turning. A
          company at the top is a company worth reading about, not one worth buying.
        </Callout>

        {snapshot?.sample && (
          <Callout tone="ochre" dashed icon={AlertTriangle}>
            These eight companies are invented, and so are their figures — they are here to show
            how the screen reads. Import a real week, or add a company yourself, and they make way.
          </Callout>
        )}
      </div>

      {!snapshot && (
        <div className="mt-6">
          <Empty
            title="No week of figures yet"
            hint={
              <>
                Run <span className="font-mono">node tools/fetch-fundamentals.mjs</span> to pull a
                week, then bring the file in below — or add a company by hand and type its figures
                off the annual report.
              </>
            }
          />
        </div>
      )}

      {snapshot && (
        <>
          <div className="mt-6 space-y-px">
            {shortlist.map((row) => (
              <Row
                key={row.facts.ticker}
                row={row}
                move={moves.get(row.facts.ticker)}
                lead
                onOpen={() => setOpen(row)}
              />
            ))}
          </div>

          {rest.length > 0 && (
            <>
              <div className="u-label mb-2 mt-8">The rest of the list</div>
              <div className="space-y-px">
                {rest.map((row) => (
                  <Row
                    key={row.facts.ticker}
                    row={row}
                    move={moves.get(row.facts.ticker)}
                    onOpen={() => setOpen(row)}
                  />
                ))}
              </div>
            </>
          )}

          <p className="mt-4 font-mono text-xs text-soft">
            {snapshot.facts.length} companies · figures from{" "}
            {new Date(snapshot.takenAt).toLocaleString("de-AT")} · {snapshot.source}
            {previous ? ` · movement against ${previous.week}` : " · no earlier week to compare"}
          </p>
        </>
      )}

      <Feed book={book} onImport={onImport} onAdd={() => setEditing(blankFacts())} />

      <Detail
        row={open}
        move={open ? moves.get(open.facts.ticker) : undefined}
        assumptions={book.assumptions}
        onEdit={(f) => {
          setOpen(null);
          setEditing(f);
        }}
        onRemove={(t) => {
          setOpen(null);
          onRemove(t);
        }}
        onClose={() => setOpen(null)}
      />

      {/* keyed so opening a different company starts from its own figures
          rather than inheriting whatever was half-typed into the last one */}
      {editing && (
        <FactsSheet
          key={editing.ticker || "new"}
          facts={editing}
          onSave={(f) => {
            onSaveFacts(f);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      <SettingsSheet
        open={settings}
        book={book}
        onAssumptions={onAssumptions}
        onShortlist={onShortlist}
        onAuto={onAuto}
        onClose={() => setSettings(false)}
      />
    </div>
  );
}

/** One company in the list. The score is on the left, the reason on the right. */
function Row({
  row,
  move,
  lead,
  onOpen,
}: {
  row: Scored;
  move?: Movement;
  lead?: boolean;
  onOpen: () => void;
}) {
  const { facts, fair } = row;
  const tone = scoreTone(row.score);

  return (
    <button
      onClick={onOpen}
      className={cx(
        "u-card flex w-full flex-wrap items-center gap-4 px-4 py-4 text-left hover:opacity-80",
        lead && `border-l-4 ${BORDER_L[tone]}`,
      )}
    >
      <div className="min-w-[3.5rem] text-center font-mono">
        <div className={cx("text-2xl leading-none", TEXT[tone])}>{Math.round(row.score)}</div>
        <div className="text-2xs uppercase tracking-widest text-soft">score</div>
      </div>

      <div className="min-w-[11rem] flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm">{facts.ticker}</span>
          <span className="truncate font-medium">{facts.name}</span>
        </div>
        <div className="mt-0.5 font-mono text-xs text-soft">
          #{row.rank} · {facts.sector} · {money(facts.price, facts.currency)}
          {move && <Moved move={move} />}
        </div>
        {row.flags.length > 0 && (
          <div className={cx("mt-1 text-xs", TEXT.ochre)}>{row.flags.join(" · ")}</div>
        )}
      </div>

      {/* ml-auto so it keeps to the right edge on a phone, where it wraps
          onto its own line rather than sitting beside the name */}
      <div className="ml-auto text-right">
        <Figure
          value={fair.marginOfSafety === null ? "—" : asDelta(fair.marginOfSafety, 0)}
          tone={fair.marginOfSafety === null ? "soft" : fair.marginOfSafety > 0 ? "green" : "red"}
          size="text-xl"
        />
        <div className="font-mono text-xs text-soft">
          {fair.blended === null
            ? "no valuation possible"
            : `under ${money(fair.blended, facts.currency)}`}
        </div>
      </div>
    </button>
  );
}

/** Places gained since last week, and what the price did to get there. */
function Moved({ move }: { move: Movement }) {
  if (move.wasRank === null) return <span className={TEXT.blue}> · new this week</span>;
  const Icon = move.moved! > 0 ? ArrowUpRight : move.moved! < 0 ? ArrowDownRight : Minus;
  const tone: Tone = move.moved! > 0 ? "green" : move.moved! < 0 ? "red" : "soft";
  return (
    <span className={TEXT[tone]}>
      {" · "}
      <Icon size={11} className="inline" aria-hidden />
      {move.moved === 0 ? " held" : ` ${Math.abs(move.moved!)}`}
      {move.priceChange !== null && ` · price ${asDelta(move.priceChange, 1)}`}
    </span>
  );
}

/** The whole working for one company, so the ranking can be checked. */
function Detail({
  row,
  move,
  assumptions,
  onEdit,
  onRemove,
  onClose,
}: {
  row: Scored | null;
  move?: Movement;
  assumptions: Assumptions;
  onEdit: (f: StockFacts) => void;
  onRemove: (ticker: string) => void;
  onClose: () => void;
}) {
  if (!row) return null;
  const { facts, ratios: r, fair } = row;
  const cur = facts.currency;

  return (
    <Sheet
      open
      title={`${facts.ticker} · ${facts.name}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Btn className="flex-1 sm:flex-none" onClick={() => onEdit(facts)}>
            Edit the figures
          </Btn>
          <Btn tone="danger" onClick={() => onRemove(facts.ticker)}>
            <Trash2 size={13} /> Off the list
          </Btn>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
        <Cell label="Price" value={money(facts.price, cur)} />
        <Cell
          label="Looks worth"
          value={fair.blended === null ? "—" : money(fair.blended, cur)}
          note={`${fair.models} of 3 models`}
        />
        <Cell
          label="Margin of safety"
          value={asDelta(fair.marginOfSafety, 0)}
          tone={fair.marginOfSafety === null ? "soft" : fair.marginOfSafety > 0 ? "green" : "red"}
        />
        <Cell label="Score" value={String(Math.round(row.score))} tone={scoreTone(row.score)} />
      </div>

      {row.flags.length > 0 && (
        <div className="mt-4">
          <Callout tone="ochre" icon={AlertTriangle}>
            <ul className="space-y-1">
              {row.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Callout>
        </div>
      )}

      {move && (
        <p className="mt-4 font-mono text-xs text-soft">
          {move.wasRank === null
            ? "New on the list this week."
            : `Was #${move.wasRank} last week${
                move.priceChange !== null ? `, price ${asDelta(move.priceChange, 1)} since` : ""
              }.`}
        </p>
      )}

      <Section title="What it is worth">
        <p className="mb-3 text-sm text-soft">
          Three ways of putting a value on a share, at {assumptions.requiredReturn}% a year
          required. Where they disagree, the disagreement is the honest answer.
        </p>
        <div className="grid grid-cols-1 gap-px bg-rule sm:grid-cols-3">
          <Cell
            label="Graham number"
            value={fair.graham === null ? "—" : money(fair.graham, cur)}
            note="15× earnings and 1,5× book at once"
          />
          <Cell
            label="Earnings power"
            value={fair.earningsPower === null ? "—" : money(fair.earningsPower, cur)}
            note="today's profit forever, no growth"
          />
          <Cell
            label="Discounted cash flow"
            value={
              fair.discountedCashFlow === null ? "—" : money(fair.discountedCashFlow, cur)
            }
            note={`${assumptions.years} yrs, then ${assumptions.terminalGrowth}% forever`}
          />
        </div>
      </Section>

      <Section title="How cheap it is against the list">
        <Bars
          score={row.valueScore}
          parts={row.valueParts}
          labels={VALUE_LABELS}
          figures={{
            fcfYield: asPct(r.fcfYield),
            earningsYield: asPct(r.earningsYield),
            ebitToEv: asPct(r.ebitToEv),
            bookYield: r.bookYield === null ? "—" : `${r.bookYield.toFixed(2)}×`,
            salesYield: r.salesYield === null ? "—" : `${r.salesYield.toFixed(2)}×`,
          }}
        />
      </Section>

      <Section title="How good a business it is">
        <Bars
          score={row.qualityScore}
          parts={row.qualityParts}
          labels={QUALITY_LABELS}
          figures={{
            roce: asPct(r.roce),
            roe: asPct(facts.roe),
            solvency:
              r.leverage === null ? "—" : `net debt ${r.leverage.toFixed(1)}× EBITDA`,
            epsGrowth: asPct(facts.epsGrowth),
            revenueGrowth: asPct(facts.revenueGrowth),
          }}
        />
      </Section>

      <Section title="The figures behind all of it">
        <div className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
          <Cell label="Earnings per share" value={facts.eps === null ? "—" : money(facts.eps, cur)} />
          <Cell
            label="Book value per share"
            value={facts.bookValue === null ? "—" : money(facts.bookValue, cur)}
          />
          <Cell
            label="Free cash flow per share"
            value={
              r.freeCashFlowPerShare === null ? "—" : money(r.freeCashFlowPerShare, cur)
            }
          />
          <Cell
            label="Dividend yield"
            value={asPct(r.dividendYield)}
            note={facts.dividend === null ? "not published" : `${money(facts.dividend, cur)} a share`}
          />
          <Cell label="Market value" value={r.marketCap === null ? "—" : money(r.marketCap, cur, 0)} />
          <Cell
            label="Enterprise value"
            value={r.enterpriseValue === null ? "—" : money(r.enterpriseValue, cur, 0)}
            note="what buying the whole business costs"
          />
          <Cell
            label="Operating profit"
            value={facts.ebit === null ? "—" : money(facts.ebit, cur, 0)}
          />
          <Cell
            label="Net debt"
            value={
              facts.totalDebt === null || facts.cash === null
                ? "—"
                : money(facts.totalDebt - facts.cash, cur, 0)
            }
          />
        </div>
      </Section>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-t border-rule pt-4">
      <div className="u-label mb-2">{title}</div>
      {children}
    </div>
  );
}

function Cell({
  label,
  value,
  note,
  tone = "ink",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: Tone;
}) {
  return (
    <div className="bg-card p-3">
      <Label>{label}</Label>
      <div className={cx("font-mono tabular-nums", TEXT[tone])}>{value}</div>
      {note && <div className="mt-1 text-2xs leading-snug text-soft">{note}</div>}
    </div>
  );
}

/**
 * A bar per measure, showing where this company sits against the others on the
 * list rather than against an absolute standard — a P/E of 12 means one thing
 * in software and another in utilities, but "cheapest of these eight" means
 * the same thing everywhere.
 */
function Bars<K extends string>({
  score,
  parts,
  labels,
  figures,
}: {
  score: number;
  parts: Record<K, number | null>;
  labels: Record<K, string>;
  figures: Record<K, string>;
}) {
  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <Figure value={Math.round(score)} tone={scoreTone(score)} size="text-2xl" />
        <div className="flex-1">
          <Meter fraction={score / 100} tone={scoreTone(score)} height="h-2" />
        </div>
      </div>
      <div className="space-y-2">
        {(Object.keys(labels) as K[]).map((key) => {
          const p = parts[key];
          return (
            <div key={key} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs">{labels[key]}</div>
                <div className="font-mono text-2xs text-soft">{figures[key]}</div>
              </div>
              <div className="w-24 shrink-0 sm:w-40">
                {p === null ? (
                  <div className="text-right font-mono text-2xs text-soft">not published</div>
                ) : (
                  <Meter fraction={p / 100} tone={scoreTone(p)} height="h-2" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Where a week of figures comes from, and when it last came. */
function Feed({
  book,
  onImport,
  onAdd,
}: {
  book: StockBook;
  onImport: (f: File) => void;
  onAdd: () => void;
}) {
  return (
    <Panel className="mt-8" accent="blue">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <Label>Where the figures come from</Label>
          <p className="text-sm text-soft">
            {book.auto
              ? "A job runs the fetch once a week and publishes the result beside the app; the app collects it in the background and files any week it hasn't already got. It asks its own address for a file, never a data provider — doing that from a page would mean putting an API key where anyone could read it."
              : "Looking by itself is switched off. Run node tools/fetch-fundamentals.mjs yourself and bring the file in here."}
          </p>
          <p className="mt-2 font-mono text-xs text-soft">
            {book.lastFetch
              ? `Last looked ${new Date(book.lastFetch).toLocaleString("de-AT")}`
              : "Hasn't looked yet"}
            {" · a week already on the list is never overwritten by it"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex">
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onImport(file);
              }}
            />
            <span className="inline-flex min-h-touch cursor-pointer items-center justify-center gap-2 border border-rule px-3 py-2 font-mono text-xs uppercase tracking-widest hover:opacity-70">
              <Upload size={13} /> Import a week
            </span>
          </label>
          <Btn onClick={onAdd}>
            <ScrollText size={13} /> Type one in
          </Btn>
        </div>
      </div>
    </Panel>
  );
}

/* ── typing a company in by hand ─────────────────────────────────────────────
   Every figure but the price may be left blank. Blank means "not published",
   which keeps the company out of that one ranking rather than scoring it
   bottom — so a half-filled company is still worth having on the list. */

const PER_SHARE: Array<[keyof StockFacts, string]> = [
  ["eps", "Earnings per share"],
  ["bookValue", "Book value per share"],
  ["revenuePerShare", "Revenue per share"],
  ["dividend", "Dividend per share"],
];

const ABSOLUTE: Array<[keyof StockFacts, string]> = [
  ["shares", "Shares outstanding"],
  ["freeCashFlow", "Free cash flow"],
  ["ebit", "Operating profit (EBIT)"],
  ["ebitda", "EBITDA"],
  ["totalDebt", "Total debt"],
  ["cash", "Cash"],
  ["equity", "Shareholders' equity"],
];

const RATES: Array<[keyof StockFacts, string]> = [
  ["roe", "Return on equity"],
  ["epsGrowth", "Earnings growth a year"],
  ["revenueGrowth", "Revenue growth a year"],
];

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "JPY", "CAD", "AUD"];

function FactsSheet({
  facts,
  onSave,
  onClose,
}: {
  facts: StockFacts;
  onSave: (f: StockFacts) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<StockFacts>(facts);

  const set = <K extends keyof StockFacts>(field: K, value: StockFacts[K]) =>
    setDraft((d) => ({ ...d, [field]: value }));

  /* Blank is not zero here. An empty box means the figure was never published,
     and the screen has to keep those two apart. */
  const optional = (field: keyof StockFacts, label: string, hint?: string) => {
    const v = draft[field] as number | null;
    return (
      <Field key={String(field)} label={label} hint={hint}>
        <TextInput
          inputMode="text"
          value={v === null ? "" : String(v)}
          placeholder="not published"
          onChange={(e) => {
            const raw = e.target.value.trim();
            set(field, (raw === "" ? null : parseNum(raw)) as StockFacts[typeof field]);
          }}
        />
      </Field>
    );
  };

  const ready = draft.ticker.trim().length > 0 && draft.price > 0;

  return (
    <Sheet
      open
      title={facts.ticker ? `Edit ${facts.ticker}` : "Add a company"}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Btn
            tone="solid"
            className="flex-1 sm:flex-none"
            disabled={!ready}
            onClick={() => onSave({ ...draft, ticker: draft.ticker.trim().toUpperCase() })}
          >
            Put it on the list
          </Btn>
          <Btn className="flex-1 sm:flex-none" onClick={onClose}>
            Cancel
          </Btn>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ticker">
            <TextInput
              value={draft.ticker}
              placeholder="OMV.VI"
              onChange={(e) => set("ticker", e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Name">
            <TextInput
              value={draft.name}
              placeholder="OMV AG"
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Sector">
            <TextInput
              value={draft.sector}
              onChange={(e) => set("sector", e.target.value)}
            />
          </Field>
          <Field label="Currency" hint="Everything below is in this currency. Nothing is converted.">
            <Select value={draft.currency} onChange={(e) => set("currency", e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Price" hint="Last close. Without it there is nothing to compare against.">
            <NumInput value={draft.price} allowNegative={false} onChange={(n) => set("price", n)} />
          </Field>
        </div>

        <div>
          <div className="u-label mb-2">Per share, last twelve months</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PER_SHARE.map(([f, l]) => optional(f, l))}
          </div>
        </div>

        <div>
          <div className="u-label mb-2">Whole-company figures</div>
          <p className="mb-3 text-xs text-soft">
            In full, the way the report writes them — 520 million is 520000000, not 520.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {ABSOLUTE.map(([f, l]) => optional(f, l))}
          </div>
        </div>

        <div>
          <div className="u-label mb-2">Rates</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {RATES.map(([f, l]) => optional(f, l, "as a fraction: 0,15 for 15%"))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/** What the buyer wants out of a share — every valuation here depends on it. */
function SettingsSheet({
  open,
  book,
  onAssumptions,
  onShortlist,
  onAuto,
  onClose,
}: {
  open: boolean;
  book: StockBook;
  onAssumptions: (a: Assumptions) => void;
  onShortlist: (n: number) => void;
  onAuto: (on: boolean) => void;
  onClose: () => void;
}) {
  const a = book.assumptions;
  const bad = useMemo(() => a.terminalGrowth >= a.requiredReturn, [a]);

  return (
    <Sheet open={open} title="What I want out of a share" onClose={onClose} width="max-w-lg">
      <Prose>
        Nothing here is a fact about a company — it is what you, the buyer, are asking of one.
        Raise what you want back and every share on the list looks dearer.
      </Prose>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Return I want, % a year"
          hint="The rate future cash is discounted at. Roughly what shares have returned long-run."
        >
          <NumInput
            value={a.requiredReturn}
            allowNegative={false}
            onChange={(n) => onAssumptions({ ...a, requiredReturn: n })}
          />
        </Field>
        <Field
          label="Growth after that, % a year"
          hint="Forever. Keep it below the economy's growth — nothing outgrows it indefinitely."
        >
          <NumInput
            value={a.terminalGrowth}
            allowNegative={false}
            onChange={(n) => onAssumptions({ ...a, terminalGrowth: n })}
          />
        </Field>
        <Field label="Years forecast explicitly" hint="Before the growth above takes over.">
          <NumInput
            value={a.years}
            allowNegative={false}
            onChange={(n) => onAssumptions({ ...a, years: Math.round(n) })}
          />
        </Field>
        <Field
          label="Growth capped at, % a year"
          hint="However good the last five years looked. This is what stops a forecast running away."
        >
          <NumInput
            value={a.growthCap}
            allowNegative={false}
            onChange={(n) => onAssumptions({ ...a, growthCap: n })}
          />
        </Field>
        <Field label="Names on the shortlist" hint="How many go above the fold each week.">
          <NumInput
            value={book.shortlist}
            allowNegative={false}
            onChange={(n) => onShortlist(Math.round(n))}
          />
        </Field>
      </div>

      <div className="mt-6 border-t border-rule pt-4">
        <div className="u-label mb-2">Collecting the week</div>
        <Checkbox checked={book.auto} onChange={onAuto} tone="blue">
          Fetch a new week on its own
        </Checkbox>
        <p className="mt-2 text-xs text-soft">
          The app's only network call: it asks its own address for the file the
          scheduled job left there, at most twice a day, and files any week it hasn't
          already got. Turn it off and nothing leaves the device — you bring the weeks
          in by hand. Either way, a week already on the list is never overwritten.
        </p>
      </div>

      {bad && (
        <div className="mt-4">
          <Callout tone="red" icon={AlertTriangle}>
            Growth forever at or above the return you want makes every company worth an infinite
            amount. The cash flow model sits out until that is back the right way round.
          </Callout>
        </div>
      )}
    </Sheet>
  );
}
