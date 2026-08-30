import type { Config } from "tailwindcss";
import ridePreset from "../../packages/config/tailwind.preset";

export default {
  presets: [ridePreset as Config],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/maps/src/**/*.{ts,tsx}",
  ],
} satisfies Config;
