import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  PiggyBank,
  Users,
} from "lucide-react";
import type { Data, Horizon } from "../types";
import type { Derived } from "../lib/derive";
import type { MonthRow } from "../lib/forecast";
import { HORIZONS } from "../lib/constants";
import { eur, eurAxis } from "../lib/format";
import { longLabel, shortLabel } from "../lib/month";
import { usePalette } from "../hooks/useTheme";
import { useIsNarrow } from "../hooks/useMediaQuery";
import {
  Callout,
  Figure,
  Label,
  Meter,
  NumInput,
  Panel,
  SectionTitle,
  Stat,
  TEXT,
  cx,
  type Tone,
} from "../components/ui";

export const balTone = (balance: number, floor: number): Tone =>
  balance < floor ? "red" : balance < 0 ? "ochre" : "ink";

export function Overview({
  data,
  d,
  update,
}: {
  data: Data;
  d: Derived;
  update: (fn: (d: Data) => Data) => void;
}) {
  const P = usePalette();
  const narrow = useIsNarrow();
  const { months, floor, horizon, lowest, heaviest, breach, clearsBy, headroom } = d;
  const end = d.last;

  const tickInterval = narrow ? (horizon > 12 ? 2 : 1) : horizon > 18 ? 1 : 0;

  return (
    <div className="mt-6">
      {/* the six figures the month comes down to */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          label="Really costs me / month"
          value={eur(d.netCost)}
          tone="red"
          icon={ArrowDownRight}
          note={`${eur(d.mExpense)} leaves the account, ${eur(d.mReimb)} comes back from other people.`}
        />
        <Stat
          label="Comes in / month"
          value={eur(d.mIncome)}
          tone="green"
          icon={ArrowUpRight}
          note={`Averaged over the next ${horizon} months, so extra pay is spread out.`}
        />
        <Stat
          label="Left over / month"
          value={eur(d.leftover)}
          tone={d.leftover < 0 ? "red" : "ink"}
          note={
            d.leftover < 0
              ? "You're spending more than comes in."
              : "After bills and after money moved into savings."
          }
        />
        <Stat
          label="Into savings / month"
          value={eur(d.mSaving)}
          tone="blue"
          icon={PiggyBank}
          note="Wohnsparbuch, Revolut and anything else you set aside."
        />
        <Stat
          label="Riding on other people"
          value={eur(d.passThrough)}
          tone="ochre"
          icon={Users}
          note="You pay this first and get it back. If a payment stops, you carry it."
        />
        <Stat
          label="Set aside for irregular bills"
          value={eur(d.mIrregular)}
          tone="ink"
          icon={CalendarClock}
          note="Park this every month and the quarterly and yearly bills stop hurting."
        />
      </div>

      {/* where you stand against the limit */}
      {floor < 0 && (
        <Panel accent={balTone(end.balance, floor)} className="mt-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Label>Your overdraft</Label>
              <div className="text-sm text-soft">
                {clearsBy ? (
                  <>
                    On this plan you're back above zero in{" "}
                    <span className="text-green">{longLabel(clearsBy.idx)}</span>.
                  </>
                ) : (
                  <>You stay below zero for the whole {horizon} months.</>
                )}
              </div>
            </div>
            <div className="flex gap-6">
              <div className="text-right">
                <Figure value={eur(end.balance)} tone={balTone(end.balance, floor)} size="text-2xl" />
                <div className="font-mono text-xs text-soft">in {shortLabel(end.idx)}</div>
              </div>
              <div className="text-right">
                <Figure
                  value={eur(headroom)}
                  tone={headroom < 0 ? "red" : headroom < 1000 ? "ochre" : "ink"}
                  size="text-2xl"
                />
                <div className="font-mono text-xs text-soft">tightest room left</div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Meter
              fraction={d.worstDrawdown / Math.abs(floor)}
              tone={headroom < 0 ? "red" : "ochre"}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-xs text-soft">
            <span>{eur(d.worstDrawdown)} used at worst</span>
            <span>limit {eur(floor)}</span>
          </div>

          {d.mInterest > 0.5 && (
            <div className="mt-3 border-t border-dashed border-rule pt-3 text-sm text-soft">
              Being overdrawn costs you about{" "}
              <span className="font-mono text-red">{eur(d.mInterest)}</span> a month in interest —
              roughly <span className="font-mono">{eur(d.totalInterest)}</span> over these {horizon}{" "}
              months. That's already in the figures above.
            </div>
          )}
        </Panel>
      )}

      {/* the month strip */}
      <section className="mt-8">
        <SectionTitle
          right={
            <div className="flex gap-1" role="group" aria-label="How far ahead to look">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  onClick={() => update((prev) => ({ ...prev, horizon: h as Horizon }))}
                  aria-pressed={horizon === h}
                  className={cx(
                    "min-h-touch border px-3 py-1 font-mono text-xs",
                    horizon === h ? "border-ink bg-ink text-card" : "border-rule text-soft",
                  )}
                >
                  {h}m
                </button>
              ))}
            </div>
          }
        >
          The next {horizon} months
        </SectionTitle>

        <div className="u-card p-3 sm:p-4">
          <div className="h-[260px] w-full">
            <ResponsiveContainer>
              <ComposedChart data={months} margin={{ top: 10, right: 6, left: -14, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fontFamily: "monospace", fill: P.soft }}
                  axisLine={{ stroke: P.rule }}
                  tickLine={false}
                  interval={tickInterval}
                />
                <YAxis
                  tick={{ fontSize: 10, fontFamily: "monospace", fill: P.soft }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  domain={[(min: number) => Math.min(min, floor) * 1.08, "auto"]}
                  tickFormatter={eurAxis}
                />
                <Tooltip
                  content={({ active, payload }) => (
                    <ChartTip
                      active={active}
                      rows={(payload ?? []) as Array<{ payload: MonthRow }>}
                      floor={floor}
                    />
                  )}
                  cursor={{ fill: "rgba(127,127,127,0.10)" }}
                />
                <ReferenceLine y={0} stroke={P.ink} />
                {floor < 0 && (
                  <ReferenceLine
                    y={floor}
                    stroke={P.red}
                    strokeDasharray="5 4"
                    label={{
                      value: `overdraft limit ${eur(floor)}`,
                      position: "insideBottomLeft",
                      fill: P.red,
                      fontSize: 10,
                      fontFamily: "monospace",
                    }}
                  />
                )}
                <Bar dataKey="net" radius={0} isAnimationActive={false}>
                  {months.map((m) => (
                    <Cell key={m.idx} fill={m.net < 0 ? P.red : P.green} fillOpacity={0.8} />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke={P.blue}
                  strokeWidth={2}
                  dot={{ r: 2, fill: P.blue }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 border-t border-rule pt-3 font-mono text-xs uppercase tracking-widest text-soft">
            <span>
              <span className="text-green">▬</span> month ends up
            </span>
            <span>
              <span className="text-red">▬</span> month ends down
            </span>
            <span>
              <span className="text-blue">—</span> account balance
            </span>
          </div>
        </div>

        {breach && (
          <div className="mt-3">
            <Callout tone="red" icon={AlertTriangle}>
              On this plan you run past the {eur(floor)} limit in{" "}
              <strong>{longLabel(breach.idx)}</strong>, reaching {eur(breach.balance)}. The gap to
              close is {eur(floor - breach.balance)} — check Ends soon for what falls away before
              then.
            </Callout>
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Panel accent={balTone(lowest.balance, floor)}>
            <Label>Thinnest month</Label>
            <div className="font-mono text-xl">{longLabel(lowest.idx)}</div>
            <div className="mt-1 text-sm text-soft">
              Balance dips to{" "}
              <span className={cx("font-mono", TEXT[balTone(lowest.balance, floor)])}>
                {eur(lowest.balance)}
              </span>
              {floor < 0 ? (
                headroom >= 0 ? (
                  <>
                    {" "}
                    — leaving <span className="font-mono">{eur(headroom)}</span> of your overdraft
                    unused.
                  </>
                ) : (
                  <>
                    {" "}
                    — that's <span className="font-mono">{eur(-headroom)}</span> past your limit.
                  </>
                )
              ) : lowest.balance < 0 ? (
                " — you'd go into overdraft here."
              ) : (
                " — that's your floor."
              )}
            </div>
          </Panel>

          <Panel accent="red">
            <Label>Heaviest bill month</Label>
            <div className="font-mono text-xl">{longLabel(heaviest.idx)}</div>
            <div className="mt-1 text-sm text-soft">
              <span className="font-mono">{eur(heaviest.expense)}</span> goes out,{" "}
              {eur(heaviest.irregular)} of it from bills that don't come every month.
            </div>
          </Panel>
        </div>
      </section>

      {/* the account itself */}
      <section className="u-card mt-8 p-4">
        <div className="u-label mb-3 border-b border-rule pb-1">Your account</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>Balance today</Label>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg">€</span>
              <NumInput
                ariaLabel="Balance today"
                value={data.opening}
                className="w-32 text-lg"
                onChange={(n) => update((p) => ({ ...p, opening: n }))}
              />
            </div>
            <div className="mt-1 text-xs text-soft">Put a minus in front if you're overdrawn.</div>
          </div>
          <div>
            <Label>Overdraft limit</Label>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg">€</span>
              <NumInput
                ariaLabel="Overdraft limit"
                value={data.overdraft}
                allowNegative={false}
                className="w-32 text-lg"
                onChange={(n) => update((p) => ({ ...p, overdraft: Math.abs(n) }))}
              />
            </div>
            <div className="mt-1 text-xs text-soft">How far your bank lets you go under.</div>
          </div>
          <div>
            <Label>Interest on the overdraft</Label>
            <div className="flex items-center gap-2">
              <NumInput
                ariaLabel="Overdraft interest rate, percent per year"
                value={data.odRate}
                allowNegative={false}
                className="w-24 text-lg"
                onChange={(n) => update((p) => ({ ...p, odRate: Math.abs(n) }))}
              />
              <span className="font-mono text-sm">% per year</span>
            </div>
            <div className="mt-1 text-xs text-soft">
              Leave at 0 to ignore it. It's on your Kontoauszug.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ChartTip({
  active,
  rows,
  floor,
}: {
  active?: boolean;
  rows: Array<{ payload: MonthRow }>;
  floor: number;
}) {
  const P = usePalette();
  if (!active || !rows.length) return null;
  const m = rows[0].payload;
  const lines: Array<[string, number, string]> = [
    ["In", m.income, P.green],
    ["Paid back to me", m.reimb, P.ochre],
    ["Out", -m.expense, P.red],
    ["Into savings", -m.saving, P.blue],
    ["Overdraft interest", -m.interest, P.red],
  ];
  return (
    <div className="min-w-[190px] border border-ink bg-card p-3 font-mono text-xs">
      <div className="mb-2 uppercase tracking-widest text-soft">{longLabel(m.idx)}</div>
      {lines
        .filter(([, v]) => Math.round(v) !== 0)
        .map(([l, v, col]) => (
          <div key={l} className="flex justify-between gap-6">
            <span className="text-soft">{l}</span>
            <span style={{ color: col }}>{eur(v)}</span>
          </div>
        ))}
      <div className="mt-2 flex justify-between gap-6 border-t border-rule pt-2">
        <span>Balance</span>
        <span className={TEXT[balTone(m.balance, floor)]}>{eur(m.balance)}</span>
      </div>
      <div className="flex justify-between gap-6 text-soft">
        <span>Room left</span>
        <span>{eur(m.balance - floor)}</span>
      </div>
    </div>
  );
}
