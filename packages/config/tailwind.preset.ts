import type { Config } from "tailwindcss";

/**
 * Shared Ride It Tailwind preset.
 * Apps import this and extend with app-specific `content` globs:
 *
 *   import ridePreset from "@ride-it/config/tailwind.preset";
 *   export default { presets: [ridePreset], content: [...] } satisfies Config;
 */
const preset: Omit<Config, "content"> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "var(--ink)",
          soft: "var(--ink-soft)",
          blue: "var(--ink-blue)",
        },
        signal: {
          blue: "var(--signal-blue)",
          "blue-text": "var(--signal-blue-text)",
        },
        marigold: {
          DEFAULT: "var(--marigold)",
          text: "var(--marigold-text)",
        },
        meter: {
          green: "var(--meter-green)",
          "green-text": "var(--meter-green-text)",
        },
        alert: {
          red: "var(--alert-red)",
          "red-text": "var(--alert-red-text)",
        },
        violet: {
          DEFAULT: "var(--violet)",
          text: "var(--violet-text)",
        },
        rose: {
          DEFAULT: "var(--rose)",
          text: "var(--rose-text)",
        },
        cyan: {
          DEFAULT: "var(--cyan)",
          text: "var(--cyan-text)",
        },
        paper: "var(--paper)",
        surface: "var(--surface)",
        border: "var(--border)",
        tint: {
          blue: "var(--tint-blue)",
          marigold: "var(--tint-marigold)",
          violet: "var(--tint-violet)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        meter: ["var(--font-meter)", "monospace"],
      },
      borderRadius: {
        DEFAULT: "10px",
        lg: "14px",
        xl: "20px",
        "2xl": "28px",
        sheet: "24px 24px 0 0",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        brand: "var(--shadow-brand)",
        marigold: "var(--shadow-marigold)",
      },
      backgroundImage: {
        "gradient-brand": "var(--gradient-brand)",
        "gradient-cta": "var(--gradient-cta)",
        "gradient-hero": "var(--gradient-hero)",
        "gradient-online": "var(--gradient-online)",
      },
      keyframes: {
        "digit-tick": {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "sheet-in": {
          "0%": { transform: "translateY(16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.75)", opacity: "0.6" },
          "80%": { transform: "scale(1.8)", opacity: "0" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.94)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "float-y": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
      animation: {
        "digit-tick": "digit-tick 180ms ease-out",
        "sheet-in": "sheet-in 240ms cubic-bezier(0.22, 1, 0.36, 1)",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.2, 0.6, 0.4, 1) infinite",
        "scale-in": "scale-in 200ms cubic-bezier(0.22, 1, 0.36, 1)",
        "float-y": "float-y 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default preset;
