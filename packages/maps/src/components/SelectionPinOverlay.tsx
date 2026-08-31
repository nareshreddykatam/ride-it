"use client";

import * as React from "react";
import { PinGlyph } from "@ride-it/ui";

/**
 * The floating, always-centered pin used by RideMap's selectionMode —
 * CSS-positioned over the map container, never a real map marker, so it
 * stays glued to the container's visual center as the passenger pans the
 * map underneath it. Extracted into its own module (rather than living in
 * RideMap.tsx) so both RideMap.tsx (which React.lazy-imports OsmMap.tsx)
 * and OsmMap.tsx can import it without a runtime circular dependency
 * between the two.
 */
export function SelectionPinOverlay({ tone = "pickup" }: { tone?: "pickup" | "drop" }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="-translate-y-1/2">
        <PinGlyph tone={tone} size={36} className="drop-shadow-lg" />
      </div>
    </div>
  );
}
