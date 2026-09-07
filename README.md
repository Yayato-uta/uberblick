# Überblick

A single-user personal cash-flow app for one household in Austria. Euro only,
`de-AT` formatting. No accounts, no login, no server, no analytics — all data
stays on the device.

It answers five questions:

1. What does each month actually cost me, as opposed to what leaves my account?
2. Will my overdraft hold for the next 12–24 months?
3. What am I building up, and what am I still committed to pay?
4. Can I afford to save for the things with dates on them?
5. Of the shares I am watching, which look cheap against what the businesses
   earn — and which are only cheap because the business is failing?

## Running it

Needs Node 18 or newer.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm test
```

`npm run preview` serves the built app — use that one when you want to test the
service worker, install-to-home-screen, or offline behaviour, because none of
that runs under `npm run dev`.

To reach it from a phone on the same network:

```bash
npm run dev -- --host
```

Installing to a home screen requires HTTPS (or `localhost`), so for a real phone
test either use a tunnel or deploy the `dist/` folder to any static host.

## How it is put together

```
src/
  types.ts            the persisted shape, byte-compatible with older backups
  lib/
    month.ts          month indices, occursIn, frequency helpers
    forecast.ts       the month-by-month roll-forward, incl. overdraft interest
    derive.ts         everything the views read, computed in one pass
    migrate.ts        validation + version-0 migration; refuses foreign files
    storage.ts        IndexedDB with a localStorage fallback, debounced autosave
    backup.ts         export via Web Share or download, import with validation
    palette.ts        the light and dark palettes — one source of truth
    constants.ts      kinds, frequencies, categories, asset kinds, seed data
    valuation.ts      fair value, the yields, the ranking — the stock screen
    snapshot.ts       reading a week of company figures in, and keeping them
  hooks/              data, theme, media queries, install prompt
  components/         shared UI, sheets, the custom month picker, navigation
  views/              the eight screens
tools/
  fetch-fundamentals.mjs   pulls a week of figures; run it yourself, weekly
  watchlist.json           the companies that week covers
```

The arithmetic lives entirely in `lib/`. Views are a display layer over
`derive(data)` and hold no figures of their own, which is why the tests only
cover `lib/`.

### Month arithmetic

Everything is at year-month granularity. An index is an absolute month number,
`year * 12 + monthIndex0`. A schedule is anchored on its **first** payment, not
on January: a quarterly bill first paid in September recurs in December, March
and June. See `src/lib/month.test.ts`.

### The forecast

Per month: `net = income + reimb - expense - saving`, then the balance moves,
then overdraft interest is charged on whatever is still negative at month end —
so it compounds. That is deliberate: the point is to show what an overdraft
costs when it lingers.

All headline figures on Overview are **means across the horizon**, not this
month's values. That is what spreads Urlaubsgeld and Weihnachtsgeld across the
year. Switching 12/18/24 changes those averages and never touches a
per-payment amount.

## The weekly stock screen

**Undervalued** ranks a watchlist by how cheap each company looks against what
it earns, owns and brings in — and then marks that down for how good a business
it actually is. It is a screener. It is not advice, and the screen says so on
every visit.

### How a company is scored

Three readings, deliberately kept apart because they fail in different ways.

**Absolute — what a share looks worth.** Three old models, and the mean of
whichever of them the figures allow:

| Model | What it says | Needs |
| --- | --- | --- |
| Graham number | `√(22,5 · EPS · book)` — 15× earnings and 1,5× book at once | positive EPS and book |
| Earnings power | today's profit as a perpetuity at the required return | positive EPS |
| Discounted cash flow | free cash flow grown for N years, then forever | positive free cash flow |

The gap between that mean and the price is the **margin of safety**. This is the
half that stops a watchlist of expensive companies from producing bargains.

**Relative — how it compares with the list.** Five yields — free cash flow,
earnings, EBIT ÷ enterprise value, book ÷ price, revenue ÷ price — each ranked
across the watchlist and averaged, cash weighted heaviest. This is the half that
survives a sector where absolute multiples mean nothing.

**Quality — whether the business is worth owning at any price.** Return on
capital employed, return on equity, how little debt it carries, and growth in
earnings and revenue. Quality never adds to a score; it only discounts one, by
up to 40%. A company that is cheap on every yield and weak underneath is flagged
in words as a value trap.

Anything not published stays `null` and sits out that one ranking, rather than
being scored zero — a company is judged on the figures it has, not on the ones
its source happened to omit.

The assumptions behind all of it — the return you want, terminal growth, the
forecast horizon, the growth cap — are yours to set, and every valuation moves
when you change them.

### Feeding it a week

The app fetches nothing. Run the script yourself, once a week, and import what
it writes:

```bash
node tools/fetch-fundamentals.mjs --key YOUR_KEY
```

A free [Financial Modeling Prep](https://financialmodelingprep.com) key covers
the endpoints it uses; `--tickers A,B,C` overrides `tools/watchlist.json`. If you
already have the figures from somewhere else, skip the fetch entirely:

```bash
node tools/fetch-fundamentals.mjs --csv figures.csv
```

Either way it writes `stocks-YYYY-Www.json`, and **Undervalued → Import a week**
brings it in. Importing replaces that week and leaves the others; eight weeks are
kept, which is what the "was #4 last week" column reads from. You can also type a
company in by hand off its annual report.

The reader is forgiving on purpose — it takes `symbol` for `ticker`, `close` for
`price`, a rate written either `0.15` or `15`, and a number written either
`1234.5` or `"1,234.50"` — so a file from another source imports without being
reshaped first. The one thing it never does is guess: a field it cannot read
becomes `null`, never `0`.

### What it cannot do

- It knows only what you fed it. A profit warning, a lawsuit, an accounting
  fraud or a sector turning over are all invisible to it.
- The figures are as fresh as your last fetch, and a week old by design.
- **Banks and insurers do not fit it.** Enterprise value, EBITDA and free cash
  flow mean little for a balance-sheet business, so those companies rank on the
  handful of measures that survive. Read them somewhere else.
- The relative half is relative to *your* watchlist. Add one very expensive
  company and everything else looks better. That is a property of ranking, and
  it is why the absolute half carries equal weight.
- The eight companies shipped with the app are invented, and labelled as such.
  They make way the moment a real week is imported or a real company typed in.

## Data safety

- **Back up** writes the whole plan as `uberblick-YYYY-MM.json`. On a phone it
  goes through the share sheet, so it can land in iCloud or Drive.
- **Restore** validates the file first and refuses anything that isn't
  recognisably this shape, rather than wiping a good plan.
- **Start empty** asks first.
- The app nudges for a backup after a session with a lot of edits, and the date
  of the last one sits in the footer.

Backups written by the original single-file version import unchanged: they carry
no `schemaVersion`, are treated as version 0, and have `goals`, `assets`,
`overdraft` and `odRate` filled in at their defaults.

## Icons

`tools/make-icons.ps1` regenerates the PNGs in `public/` (Windows, uses
System.Drawing). The favicon is hand-written SVG.

## Offline

The service worker precaches the built assets, so after the first load the app
works with no connection at all. Nothing is fetched from a network at runtime —
there are no web fonts, no CDNs and no telemetry.

The stock screen does not change that. `tools/fetch-fundamentals.mjs` runs on
your machine and writes a file; the app only ever reads a file you hand it,
through the same file picker as a backup restore. The app itself has still never
made a network call.
