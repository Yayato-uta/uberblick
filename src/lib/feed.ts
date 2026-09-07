import type { Snapshot, StockBook } from "../types";
import { readSnapshot } from "./snapshot";

/* The one network call in the whole app.
 *
 * It asks the app's OWN origin for a file that a scheduled job put there —
 * see .github/workflows/stocks.yml, which runs the same fetch script you
 * would run by hand and commits what it gets. The app never talks to a data
 * provider directly, and it never could: doing so would mean shipping an API
 * key inside a public page, where the first person to open the sources has it.
 *
 * Everything here fails quietly. A plane, a tunnel, a dead provider or a
 * workflow nobody has given a key to all look the same from in here — the
 * screen keeps working on the weeks it already has, because those are stored
 * on the device and were never a cache of this. */

/** Relative, because the app is built with `base: "./"` and may live anywhere. */
export const FEED_URL = "./stocks/latest.json";

/** Long enough for a slow phone, short enough not to hang a screen. */
const TIMEOUT_MS = 8000;

/** Look again after this long, so opening the app ten times looks once. */
const RECHECK_AFTER_MS = 12 * 60 * 60 * 1000;

/**
 * Fetch the published week, or null if there isn't one to be had. Never
 * throws: every failure — offline, 404, half-written JSON, a file that turns
 * out to be something else entirely — comes back the same way.
 */
export async function fetchWeek(url: string = FEED_URL): Promise<Snapshot | null> {
  if (typeof fetch !== "function") return null;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    /* no-store, because a week-old copy in the HTTP cache is exactly the
       thing this call exists to replace. */
    const res = await fetch(url, { signal: abort.signal, cache: "no-store" });
    if (!res.ok) return null;
    return readSnapshot(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Is it worth looking? Only when the owner asked for it, and not if we
 * already looked recently — the file changes once a week, so checking on
 * every single load would be asking a question whose answer cannot have
 * changed.
 */
export function dueACheck(book: StockBook, now: Date = new Date()): boolean {
  if (!book.auto) return false;
  if (!book.lastFetch) return true;
  const last = Date.parse(book.lastFetch);
  // an unreadable stamp is treated as never having looked
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= RECHECK_AFTER_MS;
}

/**
 * Should this fetched week actually be taken?
 *
 * Only when it is a week the book has no REAL record of. A week already in
 * the book is left exactly as it is — which is what protects a week you typed
 * companies into yourself from being quietly replaced by the watchlist's
 * version of the same seven days. Correcting a week stays a deliberate act:
 * Import a week still overwrites, because you asked it to.
 *
 * The shipped illustration is the exception, and it has to be: it is stamped
 * with whatever week you first opened the app in, so treating it as a record
 * of that week would refuse the very first real fetch — and go on refusing it
 * for seven days, which looks exactly like the feature not working.
 */
export function shouldTake(book: StockBook, incoming: Snapshot): boolean {
  if (incoming.facts.length === 0) return false;
  return !book.snapshots.some((s) => s.week === incoming.week && !s.sample);
}
