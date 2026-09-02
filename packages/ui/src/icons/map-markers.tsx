import * as React from "react";

export type PinTone = "pickup" | "drop" | "driver";

const TONE_COLOR: Record<PinTone, string> = {
  pickup: "var(--meter-green)",
  drop: "var(--alert-red)",
  driver: "var(--signal-blue)",
};

export interface PinGlyphProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
  tone?: PinTone;
}

/**
 * Ridora's teardrop marker glyph — used inline in pickup/destination rows
 * (booking cards, active-ride overlay) so the same mark that appears on the
 * map also anchors the text rows describing it. Not a map marker itself;
 * RideMap's real Google Maps AdvancedMarkerElement/PinElement carries the
 * matching colors on the actual map surface.
 */
export const PinGlyph = React.forwardRef<SVGSVGElement, PinGlyphProps>(
  ({ size = 20, tone = "pickup", className, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M12 2C7.58 2 4 5.58 4 10c0 6.08 7.16 11.32 7.47 11.54a.9.9 0 0 0 1.06 0C12.84 21.32 20 16.08 20 10c0-4.42-3.58-8-8-8Z"
        fill={TONE_COLOR[tone]}
      />
      <circle cx="12" cy="10" r="3" fill="white" />
    </svg>
  )
);
PinGlyph.displayName = "PinGlyph";
