import type { Assumptions, Snapshot, StockBook, StockFacts } from "../types";

/* What a share is worth, and how far the price has strayed from it.
 *
 * Two questions are asked of every company, and they are deliberately kept
 * apart because they fail in different ways:
 *
 *   1. Cheap against what it earns — an ABSOLUTE reading. Three old,
 *      well-understood models each put a value on a share; the gap between
 *      that value and the price is the margin of safety. This is the one that
 *      stops a screen full of expensive companies from producing bargains.
 *
 *   2. Cheap against its peers — a RELATIVE reading. Every yield is ranked
 *      across the watchlist and the ranks are averaged. This is the one that
 *      survives a sector where absolute multiples mean nothing.
 *
 * Both are then pulled down by a third reading, quality, because a share can
 * be cheap for an extremely good reason. A company earning nothing on its
 * capital, shrinking, and carrying three years of profit in debt is not a
 * bargain — it is a business on the way out, and the screen says so rather
 * than putting it top.
 *
 * Nothing here forecasts a price. It compares published figures against a
 * stated set of assumptions, and every intermediate number is handed back so
 * the reason for a ranking can be read off rather than taken on trust.
 */

/** The buyer's assumptions, before anyone has changed them. */
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  /* Roughly a long-run equity return. Raise it and everything looks dearer. */
  requiredReturn: 9,
  /* Below long-run nominal growth on purpose: a business that outgrows the
     economy forever eventually becomes the economy. */
  terminalGrowth: 2.5,
  years: 5,
  /* Five good years extrapolated forever is how a DCF produces nonsense. */
  growthCap: 12,
};

/** How many weeks of snapshots are worth keeping to show what moved. */
export const KEEP_WEEKS = 8;

/* Cash is harder to dress up than earnings, so it carries the most weight;
   sales are the least informative and carry the least. */
const VALUE_WEIGHTS = {
  fcfYield: 0.3,
  earningsYield: 0.25,
  ebitToEv: 0.2,
  bookYield: 0.15,
  salesYield: 0.1,
} as const;

/* Return on capital first: it is the closest thing to a verdict on whether
   the business is worth owning at any price. */
const QUALITY_WEIGHTS = {
  roce: 0.3,
  roe: 0.2,
  solvency: 0.2,
  epsGrowth: 0.15,
  revenueGrowth: 0.15,
} as const;

/* Quality never zeroes a score, it discounts one: the worst business on the
   list keeps 60% of what its cheapness earned it. */
const QUALITY_FLOOR = 0.6;

/** Below this quality, cheapness starts looking like a warning instead. */
const TRAP_QUALITY = 35;
/** ...but only if the thing is conspicuously cheap in the first place. */
const TRAP_VALUE = 65;

/** More than this much debt against a year's EBITDA counts as stretched. */
const HEAVY_LEVERAGE = 3;

export type ValueKey = keyof typeof VALUE_WEIGHTS;
export type QualityKey = keyof typeof QUALITY_WEIGHTS;

/**
 * Everything derivable from one company's figures alone, before any
 * comparison with the rest of the list. Every field is null when the figures
 * it needs are missing, and null propagates rather than becoming zero.
 */
export interface Ratios {
  marketCap: number | null;
  /** market cap plus debt less cash — what buying the whole business costs */
  enterpriseValue: number | null;
  freeCashFlowPerShare: number | null;
  /** all five of these are yields: bigger is cheaper */
  earningsYield: number | null;
  fcfYield: number | null;
  bookYield: number | null;
  salesYield: number | null;
  ebitToEv: number | null;
  dividendYield: number | null;
  /** EBIT over capital employed — what the business earns on what it uses */
  roce: number | null;
  /** net debt as a multiple of a year's EBITDA */
  leverage: number | null;
  /** the inverse of leverage, so that bigger is better like everything else */
  solvency: number | null;
}

/** The three views of what a share is worth, and what they came to together. */
export interface FairValue {
  /** √(22.5 · EPS · book) — Graham's ceiling for a defensive buyer */
  graham: number | null;
  /** a perpetuity of today's earnings at the required return */
  earningsPower: number | null;
  /** free cash flow grown for `years`, then a terminal value, discounted */
  discountedCashFlow: number | null;
  /** the mean of whichever of the three could be worked out */
  blended: number | null;
  /** how many of the three that was */
  models: number;
  /** (fair − price) / fair. Positive means the price is below the value. */
  marginOfSafety: number | null;
}

export interface Scored {
  facts: StockFacts;
  ratios: Ratios;
  fair: FairValue;
  /** 0–100, where the company sits against the list on the five yields */
  valueScore: number;
  /** 0–100, same idea on the five quality measures */
  qualityScore: number;
  /** 0–100, the margin of safety put on the same scale */
  safetyScore: number;
  /** the ranking figure: cheapness, discounted for poor quality */
  score: number;
  /** the percentile each yield earned, for showing the working */
  valueParts: Record<ValueKey, number | null>;
  qualityParts: Record<QualityKey, number | null>;
  /** plain-language warnings, worst first */
  flags: string[];
  /** 1-based, in `score` order */
  rank: number;
}

const finite = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** a / b, or null unless both are usable and b is not zero. */
function ratio(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!finite(a) || !finite(b) || b === 0) return null;
  const r = a / b;
  return Number.isFinite(r) ? r : null;
}

export const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;

/** Everything one company's own figures will yield, on their own. */
export function ratios(f: StockFacts): Ratios {
  const price = finite(f.price) && f.price > 0 ? f.price : null;
  const marketCap = price !== null && finite(f.shares) && f.shares > 0 ? price * f.shares : null;

  /* Debt and cash are additions to the price of the business, not to the
     price of a share, so they only enter through enterprise value. */
  const enterpriseValue =
    marketCap !== null && finite(f.totalDebt) && finite(f.cash)
      ? marketCap + f.totalDebt - f.cash
      : null;

  const freeCashFlowPerShare =
    finite(f.freeCashFlow) && finite(f.shares) && f.shares > 0 ? f.freeCashFlow / f.shares : null;

  /* Capital employed the simple way: what the owners put in plus what was
     borrowed, less cash that is not being employed in anything. */
  const capitalEmployed =
    finite(f.equity) && finite(f.totalDebt) && finite(f.cash)
      ? f.equity + f.totalDebt - f.cash
      : null;

  const netDebt = finite(f.totalDebt) && finite(f.cash) ? f.totalDebt - f.cash : null;

  /* Net cash is the absence of leverage, not negative leverage, so it clamps
     at zero rather than rewarding a company twice for holding cash. */
  const leverage =
    netDebt !== null && finite(f.ebitda) && f.ebitda > 0 ? Math.max(0, netDebt / f.ebitda) : null;

  return {
    marketCap,
    enterpriseValue,
    freeCashFlowPerShare,
    earningsYield: ratio(f.eps, price),
    fcfYield: ratio(freeCashFlowPerShare, price),
    bookYield: ratio(f.bookValue, price),
    salesYield: ratio(f.revenuePerShare, price),
    /* Greenblatt's yield: what the whole business earns against what the whole
       business costs, which is why it beats P/E across different debt loads. */
    ebitToEv: enterpriseValue !== null && enterpriseValue > 0 ? ratio(f.ebit, enterpriseValue) : null,
    dividendYield: ratio(f.dividend, price),
    roce:
      capitalEmployed !== null && capitalEmployed > 0 ? ratio(f.ebit, capitalEmployed) : null,
    leverage,
    /* 1/(1+x): 0× debt scores 1, 3× scores 0.25, and it never divides by zero. */
    solvency: leverage === null ? null : 1 / (1 + leverage),
  };
}

/**
 * Graham's number — the most a defensive buyer should pay, being 15 times
 * earnings and 1.5 times book at once (15 × 1.5 = 22.5). It needs both to be
 * positive, which quietly excludes every loss-making company, as intended.
 */
export function grahamNumber(eps: number | null, book: number | null): number | null {
  if (!finite(eps) || !finite(book) || eps <= 0 || book <= 0) return null;
  return Math.sqrt(22.5 * eps * book);
}

/**
 * What today's earnings are worth if they never grow and never shrink —
 * a perpetuity at the required return. Deliberately the least generous of the
 * three models: it gives growth no credit at all.
 */
export function earningsPowerValue(eps: number | null, requiredReturn: number): number | null {
  if (!finite(eps) || eps <= 0) return null;
  const r = requiredReturn / 100;
  if (!(r > 0)) return null;
  return eps / r;
}

/**
 * Free cash flow per share grown for a few explicit years and then forever at
 * the terminal rate, all discounted back. Growth is capped and floored at
 * zero, because the years a screen can see are never the years that matter.
 */
export function dcfValue(
  fcfPerShare: number | null,
  growth: number | null,
  a: Assumptions,
): number | null {
  if (!finite(fcfPerShare) || fcfPerShare <= 0) return null;
  const r = a.requiredReturn / 100;
  const t = a.terminalGrowth / 100;
  // a business growing faster than the discount rate forever is worth infinity
  if (!(r > t) || !(r > 0)) return null;

  const g = clamp(finite(growth) ? growth : 0, 0, a.growthCap / 100);
  const years = Math.max(1, Math.round(a.years));

  let pv = 0;
  let cash = fcfPerShare;
  for (let i = 1; i <= years; i++) {
    cash *= 1 + g;
    pv += cash / (1 + r) ** i;
  }
  // everything after the explicit years, valued as a growing perpetuity
  pv += (cash * (1 + t)) / (r - t) / (1 + r) ** years;
  return pv;
}

/** All three models, their mean, and the gap between that and the price. */
export function fairValue(f: StockFacts, rs: Ratios, a: Assumptions): FairValue {
  const graham = grahamNumber(f.eps, f.bookValue);
  const earningsPower = earningsPowerValue(f.eps, a.requiredReturn);
  /* Earnings growth over revenue growth: the DCF discounts cash, and cash
     tracks profit more closely than it tracks turnover. */
  const growth = finite(f.epsGrowth) ? f.epsGrowth : f.revenueGrowth;
  const discountedCashFlow = dcfValue(rs.freeCashFlowPerShare, growth, a);

  const got = [graham, earningsPower, discountedCashFlow].filter(finite);
  const blended = got.length ? got.reduce((t, v) => t + v, 0) / got.length : null;

  const marginOfSafety =
    blended !== null && blended > 0 && finite(f.price) ? (blended - f.price) / blended : null;

  return {
    graham,
    earningsPower,
    discountedCashFlow,
    blended,
    models: got.length,
    marginOfSafety,
  };
}

/**
 * Where each value sits in the list, 0–100, biggest last. Ties share the
 * average of the places they take up, so three identical figures all get the
 * middle one rather than an arbitrary order deciding it.
 *
 * A missing figure is not ranked at all — it comes back null, and the caller
 * leaves it out of the average rather than scoring it zero. Ranking a company
 * bottom for a number nobody published would be a verdict on the data source,
 * not on the company.
 */
export function percentiles(values: Array<number | null>): Array<number | null> {
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((e): e is { v: number; i: number } => finite(e.v))
    .sort((x, y) => x.v - y.v);

  const out: Array<number | null> = values.map(() => null);
  const n = present.length;
  // one company is neither top nor bottom of anything
  if (n === 0) return out;
  if (n === 1) {
    out[present[0].i] = 50;
    return out;
  }

  let k = 0;
  while (k < n) {
    let j = k;
    while (j + 1 < n && present[j + 1].v === present[k].v) j++;
    // the mean place of the tied block, mapped onto 0–100
    const place = (k + j) / 2;
    const pctile = (place / (n - 1)) * 100;
    for (let m = k; m <= j; m++) out[present[m].i] = pctile;
    k = j + 1;
  }
  return out;
}

/**
 * A weighted mean over whichever parts are present, renormalised so a company
 * missing one figure is judged on the rest rather than dragged toward zero.
 * Nothing present at all is a flat 50 — no opinion either way.
 */
function weighted<K extends string>(
  parts: Record<K, number | null>,
  weights: Record<K, number>,
): number {
  let total = 0;
  let used = 0;
  for (const key of Object.keys(weights) as K[]) {
    const p = parts[key];
    if (!finite(p)) continue;
    total += p * weights[key];
    used += weights[key];
  }
  return used > 0 ? total / used : 50;
}

/** The margin of safety on the same 0–100 scale as everything else. */
export function safetyScore(marginOfSafety: number | null): number {
  // priced at fair value scores 50; half price scores 100; double scores 0
  if (!finite(marginOfSafety)) return 50;
  return clamp(50 + marginOfSafety * 100, 0, 100);
}

function flagsFor(f: StockFacts, rs: Ratios, fair: FairValue, quality: number, value: number): string[] {
  const out: string[] = [];
  if (finite(f.eps) && f.eps <= 0) out.push("Loses money");
  if (finite(rs.freeCashFlowPerShare) && rs.freeCashFlowPerShare <= 0) out.push("Burns cash");
  if (finite(rs.leverage) && rs.leverage > HEAVY_LEVERAGE)
    out.push(`Debt is ${rs.leverage.toFixed(1)}× a year's EBITDA`);
  if (finite(f.revenueGrowth) && f.revenueGrowth < 0) out.push("Revenue is shrinking");
  if (quality < TRAP_QUALITY && value > TRAP_VALUE)
    out.push("Cheap and weak — the classic value trap");
  if (fair.models === 0) out.push("No model could value it on these figures");
  else if (fair.models === 1) out.push("Only one of the three models could run");
  return out;
}

/**
 * Rank a watchlist. Every company is scored on how cheap it is both against
 * its own earnings and against the others on the list, and that is then
 * discounted for how good a business it is.
 *
 * The list is the yardstick for the relative half, so what comes back depends
 * on what went in: adding one very expensive company makes everything else
 * look better. That is a property of ranking, not a bug, and it is why the
 * absolute half carries equal weight.
 */
export function screen(facts: StockFacts[], a: Assumptions): Scored[] {
  const rows = facts.map((f) => {
    const rs = ratios(f);
    return { facts: f, ratios: rs, fair: fairValue(f, rs, a) };
  });

  const valueKeys = Object.keys(VALUE_WEIGHTS) as ValueKey[];
  const qualityKeys = Object.keys(QUALITY_WEIGHTS) as QualityKey[];

  const valueCols = {} as Record<ValueKey, Array<number | null>>;
  for (const key of valueKeys) valueCols[key] = percentiles(rows.map((r) => r.ratios[key]));

  const qualityCols = {} as Record<QualityKey, Array<number | null>>;
  for (const key of qualityKeys) {
    qualityCols[key] = percentiles(
      rows.map((r) =>
        key === "roce" || key === "solvency" ? r.ratios[key] : r.facts[key],
      ),
    );
  }

  const scored: Scored[] = rows.map((r, i) => {
    const valueParts = {} as Record<ValueKey, number | null>;
    for (const key of valueKeys) valueParts[key] = valueCols[key][i];
    const qualityParts = {} as Record<QualityKey, number | null>;
    for (const key of qualityKeys) qualityParts[key] = qualityCols[key][i];

    const valueScore = weighted(valueParts, VALUE_WEIGHTS);
    const qualityScore = weighted(qualityParts, QUALITY_WEIGHTS);
    const safety = safetyScore(r.fair.marginOfSafety);

    /* Cheapness is the score; quality only ever takes some of it away. The two
       halves of cheapness are weighted equally on purpose — the absolute one
       cannot be gamed by the choice of watchlist, the relative one cannot be
       thrown off by a sector where multiples are meaningless, and neither is
       reliable enough to be trusted alone. */
    const cheap = 0.5 * safety + 0.5 * valueScore;
    const factor = QUALITY_FLOOR + (1 - QUALITY_FLOOR) * (qualityScore / 100);

    return {
      ...r,
      valueScore,
      qualityScore,
      safetyScore: safety,
      score: cheap * factor,
      valueParts,
      qualityParts,
      flags: flagsFor(r.facts, r.ratios, r.fair, qualityScore, valueScore),
      rank: 0,
    };
  });

  scored.sort((x, y) => y.score - x.score || x.facts.ticker.localeCompare(y.facts.ticker));
  scored.forEach((s, i) => {
    s.rank = i + 1;
  });
  return scored;
}

export interface Movement {
  /** where it stood last week, or null if it wasn't on the list */
  wasRank: number | null;
  /** places gained since last week; positive is up the list */
  moved: number | null;
  /** the price change since last week, as a fraction */
  priceChange: number | null;
}

/**
 * What changed between two weeks. A name absent from the earlier week is new,
 * which is worth saying out loud — a screen is most useful at the moment
 * something arrives on it.
 */
export function movement(now: Scored[], before: Scored[]): Map<string, Movement> {
  const prior = new Map(before.map((s) => [s.facts.ticker, s]));
  const out = new Map<string, Movement>();
  for (const s of now) {
    const was = prior.get(s.facts.ticker);
    out.set(s.facts.ticker, {
      wasRank: was ? was.rank : null,
      moved: was ? was.rank - s.rank : null,
      priceChange:
        was && finite(was.facts.price) && was.facts.price > 0
          ? (s.facts.price - was.facts.price) / was.facts.price
          : null,
    });
  }
  return out;
}

/** ISO week of a date, "YYYY-Www" — the Thursday rule, same as the calendar. */
export function isoWeek(d: Date = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // shift to the Thursday of this week; the year of that Thursday is the year
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Put a snapshot at the front of the book, replacing any snapshot already
 * holding that week — re-running the fetch on a Wednesday should correct
 * Monday's figures, not sit beside them.
 */
export function fileSnapshot(snapshots: Snapshot[], next: Snapshot): Snapshot[] {
  const rest = snapshots.filter((s) => s.week !== next.week);
  return [next, ...rest].sort((a, b) => b.week.localeCompare(a.week)).slice(0, KEEP_WEEKS);
}

export interface ScreenedBook {
  /** the week being looked at, or null while the screen has never been fed */
  snapshot: Snapshot | null;
  /** the week before it, for saying what moved */
  previous: Snapshot | null;
  rows: Scored[];
  moves: Map<string, Movement>;
}

/**
 * The whole screen in one pass: the newest week ranked, and what each name did
 * against the week before. Kept here rather than in the view so that the
 * arithmetic stays testable and the screen stays a display layer over it.
 */
export function screenBook(book: StockBook): ScreenedBook {
  const [snapshot = null, previous = null] = book.snapshots;
  if (!snapshot) return { snapshot: null, previous: null, rows: [], moves: new Map() };

  const rows = screen(snapshot.facts, book.assumptions);
  const moves = previous
    ? movement(rows, screen(previous.facts, book.assumptions))
    : new Map<string, Movement>();
  return { snapshot, previous, rows, moves };
}
