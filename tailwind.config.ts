import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-canvas)",
        surface: {
          DEFAULT: "var(--color-surface)",
          subtle: "var(--color-surface-subtle)",
          raised: "var(--color-surface-raised)",
        },
        ink: {
          DEFAULT: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
        },
        line: { DEFAULT: "var(--color-border)", strong: "var(--color-border-strong)" },
        brand: { DEFAULT: "var(--color-brand)", hover: "var(--color-brand-hover)", subtle: "var(--color-brand-subtle)" },
        accent: "var(--color-accent)",
        "action-secondary": "var(--color-action-secondary)",
        link: "var(--color-link)",
        focus: "var(--color-focus)",
        success: { fg: "var(--color-success-fg)", bg: "var(--color-success-bg)" },
        warning: { fg: "var(--color-warning-fg)", bg: "var(--color-warning-bg)" },
        danger: { fg: "var(--color-danger-fg)", bg: "var(--color-danger-bg)" },
        info: { fg: "var(--color-info-fg)", bg: "var(--color-info-bg)" },
        live: { fg: "var(--color-live-fg)", bg: "var(--color-live-bg)" },
        guided: { fg: "var(--color-guided-fg)", bg: "var(--color-guided-bg)" },
        scrim: "var(--color-scrim)",
        spartan: {
          green: "#18453B",
          "green-light": "#2E6B58",
          "green-dark": "#0D2B24",
        },
      },
      fontFamily: { sans: ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "sans-serif"] },
      fontSize: {
        display: ["2.5rem", { lineHeight: "1.1", fontWeight: "700" }],
        "heading-1": ["2rem", { lineHeight: "1.2", fontWeight: "700" }],
        "heading-2": ["1.5rem", { lineHeight: "1.3", fontWeight: "700" }],
        "heading-3": ["1.125rem", { lineHeight: "1.4", fontWeight: "650" }],
        "body-lg": ["1.125rem", { lineHeight: "1.65" }],
        body: ["1rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.55" }],
        label: ["0.875rem", { lineHeight: "1.4", fontWeight: "600" }],
        caption: ["0.75rem", { lineHeight: "1.5", fontWeight: "500" }],
      },
      spacing: { 18: "4.5rem", 22: "5.5rem", "control": "2.75rem", "control-lg": "3rem" },
      borderRadius: { sm: "0.375rem", md: "0.625rem", lg: "0.875rem", xl: "1.25rem" },
      boxShadow: {
        sm: "0 1px 2px rgb(36 31 26 / 0.08)",
        md: "0 8px 24px rgb(36 31 26 / 0.10)",
        lg: "0 18px 48px rgb(36 31 26 / 0.16)",
      },
      maxWidth: { prose: "42rem", form: "36rem", participant: "72rem", operational: "90rem" },
      zIndex: { sticky: "20", dropdown: "40", scrim: "60", dialog: "70", toast: "80", critical: "90" },
      transitionDuration: { fast: "120ms", standard: "180ms", slow: "220ms" },
      transitionTimingFunction: { standard: "cubic-bezier(.2,.8,.2,1)" },
    },
  },
  plugins: [],
};

export default config;
