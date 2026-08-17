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
        paper: "var(--paper)",
        border: "var(--border)",
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
        sheet: "24px 24px 0 0",
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
      },
      animation: {
        "digit-tick": "digit-tick 180ms ease-out",
        "sheet-in": "sheet-in 240ms cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default preset;
