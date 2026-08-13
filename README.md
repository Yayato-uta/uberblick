# Überblick

A single-user personal cash-flow app for one household in Austria. Euro only,
`de-AT` formatting. No accounts, no login, no server, no analytics — all data
stays on the device.

It answers four questions:

1. What does each month actually cost me, as opposed to what leaves my account?
2. Will my overdraft hold for the next 12–24 months?
3. What am I building up, and what am I still committed to pay?
4. Can I afford to save for the things with dates on them?

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
  hooks/              data, theme, media queries, install prompt
  components/         shared UI, sheets, the custom month picker, navigation
  views/              the seven screens
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
