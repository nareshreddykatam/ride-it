import type { Config } from "tailwindcss";
import ridePreset from "../../packages/config/tailwind.preset";

export default {
  presets: [ridePreset as Config],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // Marketing-only brand palette. Additive on top of the shared
      // ridePreset (signal-blue/marigold/etc.) rather than replacing it —
      // those tokens are shared with the Passenger/Driver/Admin apps via
      // @ride-it/ui, and this redesign is scoped to the Marketing site
      // only. Every new color here is `rd-` prefixed so it can never
      // collide with (or be mistaken for) a shared token.
      colors: {
        "rd-navy": "#0B1628",
        "rd-navy-2": "#122036",
        "rd-navy-soft": "#3A4A5F",
        "rd-teal": "#0F8F78",
        "rd-teal-dark": "#0C7561",
        "rd-teal-light": "#3BAE97",
        "rd-green": "#168A62",
        "rd-mint": "#E9F7F2",
        "rd-bg": "#F7F9FA",
        "rd-gray": "#5B6B7A",
        "rd-gray-light": "#8A98A6",
        "rd-line": "#E3E9EC",
        "rd-blue": "#1677C8",
      },
      fontSize: {
        "rd-display": ["clamp(2.75rem, 5vw, 5.25rem)", { lineHeight: "0.98", letterSpacing: "-0.02em" }],
      },
      boxShadow: {
        "rd-card": "0 1px 2px rgba(11,22,40,0.04), 0 12px 28px -8px rgba(11,22,40,0.10)",
        "rd-card-lg": "0 2px 4px rgba(11,22,40,0.05), 0 24px 48px -12px rgba(11,22,40,0.16)",
        "rd-cta": "0 10px 24px -6px rgba(15,143,120,0.38)",
        "rd-shield": "0 20px 44px -12px rgba(22,119,200,0.35)",
      },
      keyframes: {
        "rd-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "rd-float-slow": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "rd-draw": {
          "0%": { strokeDashoffset: "1" },
          "100%": { strokeDashoffset: "0" },
        },
        "rd-rise": {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "rd-count": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "rd-float": "rd-float 6s ease-in-out infinite",
        "rd-float-slow": "rd-float-slow 8s ease-in-out infinite",
        "rd-rise": "rd-rise 700ms cubic-bezier(0.22,1,0.36,1) both",
        "rd-count": "rd-count 500ms ease-out both",
      },
    },
  },
} satisfies Config;
