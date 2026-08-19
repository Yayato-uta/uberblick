import { useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus, Trash2 } from "lucide-react";
import type { Asset, AssetKind, Item } from "../types";
import type { Derived } from "../lib/derive";
import { ASSET_KINDS, FREQ, assetColor } from "../lib/constants";
import { eur, eurAxis, parseNum } from "../lib/format";
import { longLabel, shortLabel } from "../lib/month";
import { usePalette } from "../hooks/useTheme";
import { useIsNarrow } from "../hooks/useMediaQuery";
import {
  Btn,
  Empty,
  Field,
  IconBtn,
  Label,
  NumInput,
  Prose,
  Select,
  Stat,
  TextInput,
} from "../components/ui";

export function Assets({
  d,
  items,
  onAdd,
  onPatch,
  onRemove,
}: {
  d: Derived;
  items: Item[];
  onAdd: (a: Omit<Asset, "id">) => void;
  onPatch: (id: string, patch: Partial<Asset>) => void;
  onRemove: (id: string) => void;
}) {
  const P = usePalette();
  const narrow = useIsNarrow();
  const savingItems = items.filter((i) => i.kind === "saving");
  const endLabel = shortLabel(d.start + d.horizon - 1);
  const tickInterval = narrow ? (d.horizon > 12 ? 2 : 1) : d.horizon > 18 ? 1 : 0;

  return (
    <div className="mt-6">
      <Prose>
        What you've already built. Link a pot to the monthly saving that feeds it and the chart
        carries it forward — the car included, since it loses value the same way the others gain it.
        To spend a pot, set an expense's <em>Paid from</em> to it over in All items: it empties on
        that line's own schedule and leaves your account balance alone.
      </Prose>

      <AssetForm onAdd={onAdd} savingItems={savingItems} />

      {d.assets.length === 0 ? (
        <Empty title="Nothing recorded yet" hint="Start with whatever is in your savings account today." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Worth today" value={eur(d.assetsNow)} />
            <Stat
              label={`In ${endLabel}`}
              value={eur(d.assetsEnd)}
              tone="green"
              note={
                d.takenOut > 0.5
                  ? `${eur(d.putIn)} from you, ${eur(d.growth)} from growth, ${eur(d.takenOut)} paid back out.`
                  : `${eur(d.putIn)} from you, ${eur(d.growth)} from growth.`
              }
            />
            <Stat
              label="Still committed to pay"
              value={eur(d.committed)}
              tone="red"
              note="Everything with an end date, after what people send back."
            />
            <Stat
              label="Net worth today"
              value={eur(d.netWorthNow)}
              tone={d.netWorthNow < 0 ? "red" : "ink"}
              note={`${eur(d.netWorthEnd)} by ${endLabel} on this plan.`}
            />
          </div>

          <div className="u-card mb-4 p-3 sm:p-4">
            <div className="u-label mb-3">How it stacks up over {d.horizon} months</div>
            <div className="h-[240px] w-full">
              <ResponsiveContainer>
                <AreaChart
                  data={d.assetSeries.rows}
                  margin={{ top: 6, right: 6, left: -14, bottom: 0 }}
                >
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
                    tickFormatter={eurAxis}
                  />
                  <Tooltip
                    contentStyle={{
                      background: P.card,
                      border: `1px solid ${P.ink}`,
                      fontFamily: "monospace",
                      fontSize: 12,
                      color: P.ink,
                    }}
                    itemStyle={{ color: P.ink }}
                    labelStyle={{ color: P.soft }}
                    formatter={(v: number, n: string) => [
                      eur(v),
                      d.assets.find((a) => a.id === n)?.name ?? n,
                    ]}
                    labelFormatter={(l: string, p) =>
                      p?.[0] ? longLabel((p[0].payload as { idx: number }).idx) : l
                    }
                  />
                  {d.assets.map((a) => (
                    <Area
                      key={a.id}
                      type="monotone"
                      dataKey={a.id}
                      stackId="own"
                      stroke={assetColor(a.kind, P)}
                      fill={assetColor(a.kind, P)}
                      fillOpacity={0.55}
                      strokeWidth={1}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 border-t border-rule pt-3 font-mono text-xs text-soft">
              {d.assets.map((a) => (
                <span key={a.id}>
                  <span style={{ color: assetColor(a.kind, P) }}>▬</span> {a.name}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-px">
            {d.assets.map((a, i) => {
              const K = ASSET_KINDS[a.kind];
              const Icon = K.icon;
              const feed = a.feed ? items.find((it) => it.id === a.feed) : undefined;
              const end = d.assetSeries.ending[i] ?? 0;
              // what empties it: expenses pointed at it, plus any goal spend
              const draws = items.filter((it) => it.fund === a.id);
              const goalDraws = d.spends.filter((sp) => sp.from === "goal" && sp.assetId === a.id);
              const takenOut = d.assetSeries.withdrawn[i] ?? 0;
              return (
                <div
                  key={a.id}
                  className="u-card flex flex-wrap items-center gap-4 border-l-4 px-4 py-4"
                  style={{ borderLeftColor: assetColor(a.kind, P) }}
                >
                  <Icon size={20} className="shrink-0" style={{ color: assetColor(a.kind, P) }} />
                  <div className="min-w-[9rem] flex-1">
                    <div className="font-medium">{a.name}</div>
                    <div className="mt-0.5 font-mono text-xs text-soft">
                      {K.label} · {Number(a.rate) >= 0 ? "+" : ""}
                      {a.rate}% a year
                      {feed
                        ? ` · fed by ${feed.name}, ${eur(feed.amount)}/mo`
                        : " · no monthly top-up"}
                    </div>

                    {(draws.length > 0 || goalDraws.length > 0) && (
                      <div className="mt-1 font-mono text-xs text-green">
                        paid out of it:{" "}
                        {[
                          ...draws.map(
                            (it) =>
                              `${it.name} ${eur(it.amount)} ${FREQ[it.freq].label.toLowerCase()}`,
                          ),
                          ...goalDraws.map((sp) => `${sp.name} ${eur(sp.amount)} once`),
                        ].join(" · ")}
                        {takenOut > 0.5 && (
                          <span className="text-soft">
                            {" "}
                            — {eur(takenOut)} out of it over {d.horizon}m
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Worth now</Label>
                    <div className="flex items-center gap-1">
                      <span className="font-mono">€</span>
                      <NumInput
                        ariaLabel={`Current value of ${a.name}`}
                        value={a.value}
                        className="w-28"
                        onChange={(n) => onPatch(a.id, { value: n })}
                      />
                    </div>
                  </div>
                  <div className="min-w-[7rem] text-right">
                    <Label>{endLabel}</Label>
                    <div
                      className="font-mono text-lg"
                      style={{ color: end >= (Number(a.value) || 0) ? P.green : P.red }}
                    >
                      {eur(end)}
                    </div>
                  </div>
                  <IconBtn tone="red" onClick={() => onRemove(a.id)} aria-label={`Remove ${a.name}`}>
                    <Trash2 size={16} />
                  </IconBtn>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function AssetForm({
  onAdd,
  savingItems,
}: {
  onAdd: (a: Omit<Asset, "id">) => void;
  savingItems: Item[];
}) {
  const empty = { name: "", kind: "savings" as AssetKind, value: "", rate: "1", feed: "" };
  const [a, setA] = useState(empty);

  const submit = () => {
    if (!a.name.trim()) return;
    const asset: Omit<Asset, "id"> = {
      name: a.name.trim(),
      kind: a.kind,
      value: parseNum(a.value),
      rate: parseNum(a.rate),
    };
    if (a.feed) asset.feed = a.feed;
    onAdd(asset);
    setA(empty);
  };

  return (
    <div className="u-card mb-4 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="What is it">
          <TextInput
            value={a.name}
            onChange={(e) => setA((p) => ({ ...p, name: e.target.value }))}
            placeholder="Savings account, investments, car…"
          />
        </Field>
        <Field label="Kind">
          <Select
            value={a.kind}
            onChange={(e) => {
              const kind = e.target.value as AssetKind;
              setA((p) => ({ ...p, kind, rate: String(ASSET_KINDS[kind].rate) }));
            }}
          >
            {(Object.keys(ASSET_KINDS) as AssetKind[]).map((k) => (
              <option key={k} value={k}>
                {ASSET_KINDS[k].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Worth today (€)">
          <TextInput
            inputMode="decimal"
            value={a.value}
            onChange={(e) => setA((p) => ({ ...p, value: e.target.value }))}
            placeholder="0"
          />
        </Field>
        <Field label="Gains or loses % a year" hint="A car goes in with a minus.">
          <TextInput
            inputMode="text"
            value={a.rate}
            onChange={(e) => setA((p) => ({ ...p, rate: e.target.value }))}
            placeholder="0"
          />
        </Field>
        <Field label="Topped up by">
          <Select
            value={a.feed}
            onChange={(e) => setA((p) => ({ ...p, feed: e.target.value }))}
          >
            <option value="">Nothing monthly</option>
            {savingItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-3">
        <Btn tone="solid" onClick={submit}>
          <Plus size={13} /> Add what you own
        </Btn>
      </div>
    </div>
  );
}
