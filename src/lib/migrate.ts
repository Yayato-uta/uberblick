import type { Asset, AssetKind, Data, Freq, Goal, Item, Kind } from "../types";
import { ASSET_KINDS, FREQ, SCHEMA_VERSION, emptyData } from "./constants";
import { parseNum, parsePos, uid } from "./format";
import { fromYM, nowIdx, toYM } from "./month";

/* Files written by the original single-file version carry no schemaVersion.
   Those are treated as version 0 and brought forward by filling in the fields
   that version never had. Anything that isn't recognisably a plan is refused
   outright rather than silently replacing good data. */

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
    const amount = parsePos(raw.reimb.amount);
    if (amount > 0) item.reimb = { who: str(raw.reimb.who).trim() || "Someone", amount };
  }
  return item;
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
