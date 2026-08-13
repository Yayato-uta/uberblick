import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { THEME_KEY } from "../lib/constants";
import { applyPalette, paletteFor, type Palette, type ThemeMode } from "../lib/palette";

interface ThemeCtx {
  palette: Palette;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  isDark: boolean;
}

const Ctx = createContext<ThemeCtx | null>(null);

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    /* fall through to auto */
  }
  return "auto";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [prefersDark, setPrefersDark] = useState(
    () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const palette = useMemo(() => paletteFor(mode, prefersDark), [mode, prefersDark]);

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(THEME_KEY, m);
    } catch {
      /* a preference, not data */
    }
  }, []);

  const value = useMemo<ThemeCtx>(
    () => ({ palette, mode, setMode, isDark: mode === "dark" || (mode === "auto" && prefersDark) }),
    [palette, mode, setMode, prefersDark],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Charts need literal colour strings, so they read the palette from here. */
export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}

export const usePalette = (): Palette => useTheme().palette;
