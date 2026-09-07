#!/usr/bin/env node
/**
 * Pull one week of company figures for the Überblick stock screen.
 *
 * The app itself never touches a network — that is the whole point of it —
 * so this runs on your machine, writes a file, and you import that file on the
 * Undervalued screen. Once a week is enough: none of these figures move faster
 * than a quarterly report.
 *
 *   node tools/fetch-fundamentals.mjs --key YOUR_KEY
 *   node tools/fetch-fundamentals.mjs --tickers OMV.VI,VOE.VI --key YOUR_KEY
 *   node tools/fetch-fundamentals.mjs --csv figures.csv
 *
 * Options
 *   --key <k>        API key. Falls back to FMP_API_KEY in the environment.
 *   --tickers a,b    Companies to fetch, instead of the watchlist file.
 *   --watchlist <f>  Default tools/watchlist.json.
 *   --csv <f>        Build the week from a CSV instead of fetching anything.
 *                    One column per field, named as below, one row per company.
 *   --out <f>        Default stocks-<week>.json in the working directory.
 *
 * On field names: this script writes them out the way the app expects, but the
 * app's reader is deliberately forgiving — it takes `symbol` for `ticker`,
 * `close` for `price`, `trailingEps` for `eps`, a rate written either as 0.15
 * or as 15, and a number written either as 1234.5 or as "1,234.50". So a file
 * assembled by hand, or by somebody else's script, imports without being
 * reshaped first. Anything it cannot read it leaves as null, meaning "not
 * published", which keeps a company out of that one ranking rather than
 * ranking it last.
 *
 * The one thing that is never guessed at is a number. A field that could not
 * be sourced is written as null, never as zero.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { argv, env, exit } from "node:process";

/* ── the fields the screen ranks on ────────────────────────────────────────
   Absolute figures are in the company's own reporting currency; per-share
   figures are per share of the class the price is quoted in. Nothing is
   converted to euro — every number the screen ranks on is a ratio of two
   figures in the same currency, so no exchange rate is needed or invented. */
const FIELDS = [
  "ticker", "name", "currency", "sector", "price", "shares",
  "eps", "bookValue", "revenuePerShare", "dividend",
  "freeCashFlow", "ebit", "ebitda", "totalDebt", "cash", "equity",
  "roe", "epsGrowth", "revenueGrowth",
];

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

/** ISO week, "YYYY-Www" — the same Thursday rule the app uses. */
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** A number, or null. Never zero as a stand-in for "nobody published it". */
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/* ── CSV ──────────────────────────────────────────────────────────────────
   Enough of a parser for a spreadsheet export: quoted fields, doubled quotes
   inside them, newlines inside them. Not a general CSV library. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function factsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("the CSV has a header row and nothing under it");
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => {
      const v = (r[i] ?? "").trim();
      // strings stay strings; everything else goes through the app's reader
      o[h] = v === "" ? null : v;
    });
    return o;
  });
}

/* ── Financial Modeling Prep ──────────────────────────────────────────────
   Four endpoints per company, because no single one carries all of it: the
   profile has the price, the currency and the sector; the TTM key metrics
   have the per-share figures; the TTM ratios have the margins and returns;
   and the growth endpoint has the rates. A free key covers all four.

   Every field is looked up through `pick`, which tries several names for the
   same figure. Data providers rename things, and a rename should cost one
   field on one company, not the whole run — so anything not found comes out
   null, the run prints which fields those were, and the screen ranks the
   company on the ones that did arrive. Check that "missing:" column the first
   time you run this against a new key: it is how you find out that a name
   has moved, and it is the reason nothing here ever falls back to zero. */
const FMP = "https://financialmodelingprep.com/api/v3";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const body = await res.json();
  if (body && body["Error Message"]) throw new Error(String(body["Error Message"]));
  return body;
}

const first = (v) => (Array.isArray(v) ? (v[0] ?? {}) : (v ?? {}));

/** The first of several names for the same figure that the source actually used. */
function pick(source, ...names) {
  for (const n of names) {
    const v = num(source[n]);
    if (v !== null) return v;
  }
  return null;
}

/** x · y, or null if either is missing — so a gap never becomes a zero. */
const times = (a, b) => (a === null || b === null ? null : a * b);

async function fetchOne(ticker, key) {
  const q = `apikey=${encodeURIComponent(key)}`;
  const at = (path) => getJson(`${FMP}/${path}/${encodeURIComponent(ticker)}?${q}`).then(first);

  const [profile, metrics, ratios, growth] = await Promise.all([
    at("profile"),
    at("key-metrics-ttm"),
    at("ratios-ttm"),
    // one company with no growth history must not lose the other eighteen fields
    at("financial-growth").catch(() => ({})),
  ]);

  const price = pick(profile, "price");
  if (!profile.symbol && price === null) {
    throw new Error("no such company, or the key was refused");
  }

  /* Share count is derived rather than read: market cap over price is the
     count the price and the cap are actually consistent with, which is what
     every per-share figure below is about to be multiplied by. */
  const marketCap = pick(profile, "mktCap", "marketCap") ?? pick(metrics, "marketCapTTM");
  const shares = marketCap !== null && price ? marketCap / price : null;

  const perShare = (...names) => times(pick(metrics, ...names), shares);

  const revenuePerShare = pick(metrics, "revenuePerShareTTM");
  const revenue = times(revenuePerShare, shares);
  const ebitda =
    pick(metrics, "ebitdaTTM") ??
    (() => {
      const ev = pick(metrics, "enterpriseValueTTM");
      const multiple = pick(metrics, "enterpriseValueOverEBITDATTM", "evToEBITDATTM");
      return ev !== null && multiple ? ev / multiple : null;
    })();

  const equity =
    perShare("shareholdersEquityPerShareTTM") ?? perShare("bookValuePerShareTTM");

  return {
    ticker,
    name: profile.companyName ?? ticker,
    currency: profile.currency ?? "USD",
    sector: profile.sector ?? "Unclassified",
    price,
    shares: shares === null ? null : Math.round(shares),
    eps: pick(metrics, "netIncomePerShareTTM") ?? pick(ratios, "netIncomePerShareTTM"),
    bookValue: pick(metrics, "bookValuePerShareTTM"),
    revenuePerShare,
    dividend: pick(metrics, "dividendPerShareTTM"),
    freeCashFlow: perShare("freeCashFlowPerShareTTM"),
    // operating margin times revenue, since no endpoint carries EBIT outright
    ebit: times(pick(ratios, "operatingProfitMarginTTM", "ebitPerRevenueTTM"), revenue),
    ebitda,
    totalDebt:
      perShare("interestDebtPerShareTTM") ??
      times(pick(ratios, "debtEquityRatioTTM", "debtToEquityTTM"), equity),
    cash: perShare("cashPerShareTTM"),
    equity,
    roe: pick(ratios, "returnOnEquityTTM") ?? pick(metrics, "roeTTM"),
    epsGrowth: pick(growth, "epsgrowth", "epsGrowth", "fiveYNetIncomeGrowthPerShare"),
    revenueGrowth: pick(growth, "revenueGrowth", "fiveYRevenueGrowthPerShare"),
  };
}

async function main() {
  const args = parseArgs(argv.slice(2));
  const now = new Date();
  const week = isoWeek(now);
  const out = args.out || `stocks-${week}.json`;

  let facts;
  let source;

  if (args.csv) {
    facts = factsFromCsv(await readFile(args.csv, "utf8"));
    source = `${args.csv}, read ${now.toISOString().slice(0, 10)}`;
    console.log(`Read ${facts.length} companies from ${args.csv}.`);
  } else {
    const key = args.key === true ? "" : args.key || env.FMP_API_KEY || "";
    if (!key) {
      console.error(
        [
          "No API key. Either:",
          "  • pass one:  node tools/fetch-fundamentals.mjs --key YOUR_KEY",
          "    (a free key from financialmodelingprep.com covers the endpoints used here)",
          "  • or skip the fetch entirely and convert a file you already have:",
          "    node tools/fetch-fundamentals.mjs --csv figures.csv",
          "",
          `The CSV needs a header row using these names: ${FIELDS.join(", ")}`,
          "Only ticker and price are required. Leave a cell empty where a figure",
          "was never published — empty means unpublished, and the screen treats",
          "that differently from zero.",
        ].join("\n"),
      );
      exit(1);
    }

    const tickers = args.tickers
      ? String(args.tickers).split(",").map((t) => t.trim()).filter(Boolean)
      : JSON.parse(await readFile(args.watchlist || "tools/watchlist.json", "utf8")).tickers;

    facts = [];
    for (const ticker of tickers) {
      try {
        const f = await fetchOne(ticker, key);
        const missing = FIELDS.filter((k) => f[k] === null);
        facts.push(f);
        console.log(
          `  ${ticker.padEnd(10)} ${String(f.price ?? "?").padStart(9)} ${f.currency}` +
            (missing.length ? `   missing: ${missing.join(", ")}` : ""),
        );
      } catch (err) {
        // one company the source has never heard of must not lose the other 19
        console.warn(`  ${ticker.padEnd(10)} skipped — ${err.message}`);
      }
    }
    source = `financialmodelingprep, fetched ${now.toISOString().slice(0, 10)}`;
  }

  if (facts.length === 0) {
    console.error("Nothing was fetched, so nothing was written.");
    exit(1);
  }

  // --out may name a directory that isn't there yet, e.g. public/stocks/
  const dir = out.replace(/[/\\][^/\\]*$/, "");
  if (dir && dir !== out) await mkdir(dir, { recursive: true });

  await writeFile(out, `${JSON.stringify({ week, takenAt: now.toISOString(), source, facts }, null, 2)}\n`);
  console.log(`\nWrote ${facts.length} companies to ${out} for week ${week}.`);
  console.log("Open Überblick → Undervalued → Import a week, and pick that file.");
}

main().catch((err) => {
  console.error(err.message);
  exit(1);
});
