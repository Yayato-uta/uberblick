import type { Data } from "../types";
import { LAST_EXPORT_KEY } from "./constants";
import { migrate } from "./migrate";
import { nowIdx, toYM } from "./month";

export const backupFilename = (): string => `uberblick-${toYM(nowIdx())}.json`;

export function lastExportAt(): Date | null {
  try {
    const v = localStorage.getItem(LAST_EXPORT_KEY);
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function markExported(): void {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
  } catch {
    /* the date is a nicety, not the backup */
  }
}

export type ExportResult = "shared" | "downloaded" | "cancelled";

/**
 * On a phone the share sheet is the only route to iCloud or Drive, so use it
 * when the browser will take a file. Everywhere else, a plain download.
 */
export async function exportBackup(data: Data): Promise<ExportResult> {
  const json = JSON.stringify(data, null, 2);
  const name = backupFilename();

  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean;
    share?: (d: ShareData) => Promise<void>;
  };

  if (typeof File !== "undefined" && nav.canShare && nav.share) {
    const file = new File([json], name, { type: "application/json" });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: "Überblick backup" });
        markExported();
        return "shared";
      } catch (err) {
        // AbortError means the user closed the sheet; anything else falls back
        if ((err as DOMException)?.name === "AbortError") return "cancelled";
      }
    }
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markExported();
  return "downloaded";
}

export type ImportResult = { ok: true; data: Data } | { ok: false; message: string };

/** Validates before it hands anything back — a bad file must never wipe a good plan. */
export async function importBackup(file: File): Promise<ImportResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, message: "That file couldn't be opened." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "That file isn't JSON — nothing was changed." };
  }

  const data = migrate(parsed);
  if (!data) {
    return {
      ok: false,
      message: "That file has no Überblick plan in it — your data was left as it was.",
    };
  }
  return { ok: true, data: { ...data, sample: false } };
}
