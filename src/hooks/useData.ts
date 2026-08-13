import { useCallback, useEffect, useRef, useState } from "react";
import type { Data } from "../types";
import { sampleData } from "../lib/constants";
import {
  flushSave,
  installFlushHooks,
  loadData,
  onSaveFailure,
  scheduleSave,
} from "../lib/storage";

export interface UseData {
  data: Data;
  /** false until the stored plan has been read back */
  ready: boolean;
  /** a message about storage, when something went wrong */
  notice: string;
  setNotice: (s: string) => void;
  update: (fn: (d: Data) => Data) => void;
  /** wholesale replacement — import, start empty */
  replace: (d: Data) => void;
  /** how many edits this session; drives the backup nudge */
  edits: number;
  resetEdits: () => void;
  flush: () => Promise<void>;
}

export function useData(): UseData {
  const [data, setData] = useState<Data>(sampleData);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [edits, setEdits] = useState(0);
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    onSaveFailure((m) => setNotice(m));
    void (async () => {
      const { data: stored, problem } = await loadData();
      if (cancelled) return;
      if (stored) setData(stored);
      if (problem) setNotice(problem);
      readyRef.current = true;
      setReady(true);
    })();
    const uninstall = installFlushHooks();
    return () => {
      cancelled = true;
      uninstall();
    };
  }, []);

  // autosave — debounced inside the storage layer
  useEffect(() => {
    if (!ready) return;
    scheduleSave(data);
  }, [data, ready]);

  const update = useCallback((fn: (d: Data) => Data) => {
    setData((d) => fn(d));
    if (readyRef.current) setEdits((n) => n + 1);
  }, []);

  const replace = useCallback((d: Data) => {
    setData(d);
    setEdits(0);
  }, []);

  return {
    data,
    ready,
    notice,
    setNotice,
    update,
    replace,
    edits,
    resetEdits: useCallback(() => setEdits(0), []),
    flush: flushSave,
  };
}
