import { createStore, get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { Data } from "../types";
import { STORAGE_KEY } from "./constants";
import { migrate } from "./migrate";

/* IndexedDB is the primary store; localStorage is the fallback for browsers
   that refuse it (older iOS private tabs, mainly). Both hold the same JSON
   string under the same key, so a fallback write is still readable if IDB
   comes back later. */

const store = (() => {
  try {
    return createStore("uberblick", "kv");
  } catch {
    return undefined;
  }
})();

let idbUsable = typeof indexedDB !== "undefined" && store !== undefined;

async function readRaw(): Promise<string | null> {
  if (idbUsable) {
    try {
      const v = await idbGet<string>(STORAGE_KEY, store);
      if (typeof v === "string") return v;
    } catch {
      idbUsable = false;
    }
  }
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeRaw(raw: string): Promise<boolean> {
  let ok = false;
  if (idbUsable) {
    try {
      await idbSet(STORAGE_KEY, raw, store);
      ok = true;
    } catch {
      idbUsable = false;
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, raw);
    ok = true;
  } catch {
    /* quota or private mode — IDB may still have taken it */
  }
  return ok;
}

export interface LoadResult {
  data: Data | null;
  /** set when something was there but couldn't be read */
  problem?: string;
}

export async function loadData(): Promise<LoadResult> {
  let raw: string | null = null;
  try {
    raw = await readRaw();
  } catch {
    return { data: null, problem: "Couldn't reach this device's storage." };
  }
  if (!raw) return { data: null };
  try {
    const migrated = migrate(JSON.parse(raw));
    if (!migrated) return { data: null, problem: "The saved plan looked damaged and was left alone." };
    return { data: migrated };
  } catch {
    return { data: null, problem: "The saved plan couldn't be read." };
  }
}

/* ── debounced autosave ── */

const DEBOUNCE_MS = 400;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Data | null = null;
let inFlight: Promise<void> | null = null;
let onFail: ((message: string) => void) | null = null;

export function onSaveFailure(fn: (message: string) => void): void {
  onFail = fn;
}

async function commit(): Promise<void> {
  if (!pending) return;
  const snapshot = pending;
  pending = null;
  const ok = await writeRaw(JSON.stringify(snapshot));
  if (!ok && onFail) onFail("Couldn't save — your changes live only in this session.");
}

/** Called on every change; writes at most once per 400ms. */
export function scheduleSave(data: Data): void {
  pending = data;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    inFlight = commit();
  }, DEBOUNCE_MS);
}

/** Write immediately — used when the page is about to go away. */
export async function flushSave(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await commit();
  if (inFlight) await inFlight;
}

/**
 * A phone can kill a backgrounded tab without warning, so flush on anything
 * that says the page is leaving. `visibilitychange` is the only one iOS fires
 * reliably.
 */
export function installFlushHooks(): () => void {
  const onHidden = () => {
    if (document.visibilityState === "hidden") void flushSave();
  };
  const onPageHide = () => void flushSave();

  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("beforeunload", onPageHide);

  return () => {
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("beforeunload", onPageHide);
  };
}

export async function wipeStorage(): Promise<void> {
  if (idbUsable) {
    try {
      await idbDel(STORAGE_KEY, store);
    } catch {
      /* nothing to do */
    }
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
