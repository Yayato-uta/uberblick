/* One source of truth for colour. Tailwind reads these through CSS custom
   properties (see tailwind.config.js); Recharts needs literal strings, so the
   same objects are handed to the charts through the theme context. */

export interface Palette {
  paper: string;
  card: string;
  ink: string;
  soft: string;
  rule: string;
  red: string;
  green: string;
  blue: string;
  ochre: string;
  /** input wells — white on paper, a shade under the card in the dark */
  field: string;
  /** extra hues used only by asset kinds */
  violet: string;
  teal: string;
}

/** An Austrian Zahlschein: pale form-green paper, typewritten labels. */
export const LIGHT: Palette = {
  paper: "#E8EDE7",
  card: "#F9FBF7",
  ink: "#16211D",
  soft: "#5C6B63",
  rule: "#C3CDC0",
  red: "#A32B21",
  green: "#17594A",
  blue: "#1D4E89",
  ochre: "#8A5A2B",
  field: "#FFFFFF",
  violet: "#6B5B95",
  teal: "#2E7D8F",
};

/* Same hues, turned down rather than inverted: the paper goes to a dark
   green-grey and the ink to a warm off-white, so it still reads as a printed
   form rather than a terminal. */
export const DARK: Palette = {
  paper: "#141A17",
  card: "#1C2320",
  ink: "#E2E9E1",
  soft: "#93A29A",
  rule: "#333E38",
  red: "#DE6A5F",
  green: "#5CB49C",
  blue: "#7BA6DC",
  ochre: "#CF9A61",
  field: "#111714",
  violet: "#A093C7",
  teal: "#61ABBC",
};

export type ThemeMode = "auto" | "light" | "dark";

export function paletteFor(mode: ThemeMode, prefersDark: boolean): Palette {
  if (mode === "dark") return DARK;
  if (mode === "light") return LIGHT;
  return prefersDark ? DARK : LIGHT;
}

/** Writes the palette onto :root so the Tailwind colour tokens resolve. */
export function applyPalette(p: Palette): void {
  const root = document.documentElement;
  root.style.setProperty("--u-paper", p.paper);
  root.style.setProperty("--u-card", p.card);
  root.style.setProperty("--u-ink", p.ink);
  root.style.setProperty("--u-soft", p.soft);
  root.style.setProperty("--u-rule", p.rule);
  root.style.setProperty("--u-red", p.red);
  root.style.setProperty("--u-green", p.green);
  root.style.setProperty("--u-blue", p.blue);
  root.style.setProperty("--u-ochre", p.ochre);
  root.style.setProperty("--u-field", p.field);
  root.style.setProperty("color-scheme", p === DARK ? "dark" : "light");

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = p.paper;
}
