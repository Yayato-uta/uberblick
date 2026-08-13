/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // resolved from CSS custom properties set by the theme provider,
        // so light and dark share one source of truth in src/lib/palette.ts
        paper: "var(--u-paper)",
        card: "var(--u-card)",
        ink: "var(--u-ink)",
        soft: "var(--u-soft)",
        rule: "var(--u-rule)",
        red: "var(--u-red)",
        green: "var(--u-green)",
        blue: "var(--u-blue)",
        ochre: "var(--u-ochre)",
        field: "var(--u-field)",
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "SF Mono",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      spacing: {
        safe: "env(safe-area-inset-bottom)",
        "nav-h": "4.25rem",
      },
      minHeight: {
        touch: "44px",
      },
      minWidth: {
        touch: "44px",
      },
      borderRadius: {
        // the aesthetic is square — nothing here is ever rounded
        DEFAULT: "0",
      },
    },
  },
  corePlugins: {
    // no decorative flourishes anywhere in this design
    boxShadow: false,
    gradientColorStops: false,
  },
  plugins: [],
};
