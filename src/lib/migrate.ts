import type { Asset, AssetKind, Data, Freq, Goal, Item, Kind, Reimb, ReimbExtra } from "../types";
import { ASSET_KINDS, FREQ, SCHEMA_VERSION, emptyData } from "./constants";
import { parseNum, parsePos, uid } from "./format";
import { fromYM, nowIdx, toYM } from "./month";

/* Every backup this app has ever written has to come back in whole. There are
   two older shapes to carry forward, and neither may lose a figure:

   the early shape — no schemaVersion, no goals or assets, no overdraft
     settings, and a repayment that was just {who, amount}, implicitly
     mirroring the expense's own frequency and dates;

   the later shape — still no schemaVersion, but repayments carry their own
     freq/first/last and a list of lump sums.

   An early repayment is brought forward by writing out what it always meant —
   freq, first and last copied from the item — so the figures come out
   identical to what the owner saw before. Anything that isn't recognisably a
   plan is refused outright rather than silently replacing good data. */

const KINDS: Kind[] = ["expense", "income", "saving"];
const ASSET_KIND_KEYS = Object.keys(ASSET_KINDS) as AssetKind[];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : v == null ? fallback : String(v);

/** "2026-8" and "2026-08" both come out as "2026-08"; junk comes out as "". */
function normYM(v: unknown): string {
  const i = fromYM(str(v));
  return i === null ? "" : toYM(i);
}

function normItem(raw: unknown): Item | null {
  if (!isObj(raw)) return null;
  const first = normYM(raw.first) || toYM(nowIdx());
  const kind = KINDS.includes(raw.kind as Kind) ? (raw.kind as Kind) : "expense";
  const freq = (raw.freq as string) in FREQ ? (raw.freq as Freq) : "monthly";

  const item: Item = {
    id: str(raw.id) || uid(),
    name: str(raw.name).trim() || "Unnamed",
    kind,
    cat: str(raw.cat).trim() || "Other",
    amount: parsePos(raw.amount),
    freq,
    first,
    last: normYM(raw.last),
  };

  if (kind === "expense" && isObj(raw.reimb)) {
    const reimb = normReimb(raw.reimb, item);
    if (reimb) item.reimb = reimb;
  }
  return item;
}

/** A lump sum survives only if it names a month and carries money. */
function normExtras(raw: unknown): ReimbExtra[] {
  if (!Array.isArray(raw)) return [];
  const out: ReimbExtra[] = [];
  for (const e of raw) {
    if (!isObj(e)) continue;
    const month = normYM(e.month);
    const amount = parsePos(e.amount);
    if (month && amount > 0) out.push({ month, amount });
  }
  return out;
}

/**
 * A repayment with no `freq` came from the early shape, where it followed the
 * expense exactly. Spelling that out — freq, first and last taken from the item —
 * reproduces the old behaviour precisely. A repayment that already has its own
 * schedule keeps every field of it.
 *
 * The instalment may be zero when lump sums carry the whole thing, so it is the
 * pair of them, not the amount alone, that decides whether there is anything
 * here at all.
 */
function normReimb(raw: Record<string, unknown>, item: Item): Reimb | null {
  const legacy = raw.freq === undefined;
  const amount = parsePos(raw.amount);
  const extras = normExtras(raw.extras);
  if (amount <= 0 && extras.length === 0) return null;

  const freq = (raw.freq as string) in FREQ ? (raw.freq as Freq) : item.freq;
  return {
    who: str(raw.who).trim() || "Someone",
    amount,
    freq: legacy ? item.freq : freq,
    // "" is meaningful — it means "fall back to the item" — so an early record
    // gets the item's dates written in, and a later one keeps what it stored.
    first: legacy ? item.first : normYM(raw.first),
    last: legacy ? item.last : normYM(raw.last),
    extras,
  };
}

function normGoal(raw: unknown): Goal | null {
  if (!isObj(raw)) return null;
  const g: Goal = {
    id: str(raw.id) || uid(),
    name: str(raw.name).trim() || "Unnamed",
    target: parsePos(raw.target),
    from: normYM(raw.from) || toYM(nowIdx()),
    by: normYM(raw.by),
    saved: parsePos(raw.saved),
  };
  const itemId = str(raw.itemId);
  if (itemId) g.itemId = itemId;
  return g;
}

function normAsset(raw: unknown): Asset | null {
  if (!isObj(raw)) return null;
  const kind = ASSET_KIND_KEYS.includes(raw.kind as AssetKind)
    ? (raw.kind as AssetKind)
    : "other";
  const a: Asset = {
    id: str(raw.id) || uid(),
    name: str(raw.name).trim() || "Unnamed",
    kind,
    value: parseNum(raw.value),
    // a rate may legitimately be negative — a car depreciates
    rate: parseNum(raw.rate),
  };
  const feed = str(raw.feed);
  if (feed) a.feed = feed;
  return a;
}

/**
 * Turn anything claiming to be a backup into a valid `Data`, or return null if
 * it plainly isn't one. `items` being an array is the recognition test — every
 * version of this file has had it.
 */
export function migrate(raw: unknown): Data | null {
  if (!isObj(raw) || !Array.isArray(raw.items)) return null;

  const base = emptyData();
  const items = raw.items.map(normItem).filter((i): i is Item => i !== null);
  const goals = Array.isArray(raw.goals)
    ? raw.goals.map(normGoal).filter((g): g is Goal => g !== null)
    : base.goals;
  const assets = Array.isArray(raw.assets)
    ? raw.assets.map(normAsset).filter((a): a is Asset => a !== null)
    : base.assets;

  const horizonRaw = Number(raw.horizon);
  const horizon = horizonRaw === 18 ? 18 : horizonRaw === 24 ? 24 : 12;

  const data: Data = {
    items,
    goals,
    assets,
    opening: parseNum(raw.opening),
    overdraft: parsePos(raw.overdraft),
    odRate: parsePos(raw.odRate),
    horizon,
    sample: raw.sample === true,
    schemaVersion: SCHEMA_VERSION,
  };

  // drop links that point at items which no longer exist
  const itemIds = new Set(items.map((i) => i.id));
  data.goals = data.goals.map((g) => (g.itemId && !itemIds.has(g.itemId) ? omitItemId(g) : g));
  data.assets = data.assets.map((a) => (a.feed && !itemIds.has(a.feed) ? omitFeed(a) : a));

  return data;
}

function omitItemId(g: Goal): Goal {
  const { itemId: _drop, ...rest } = g;
  return rest;
}

function omitFeed(a: Asset): Asset {
  const { feed: _drop, ...rest } = a;
  return rest;
}
