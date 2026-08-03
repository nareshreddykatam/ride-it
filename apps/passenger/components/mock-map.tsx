"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@ride-it/ui";

export interface MockMapProps {
  variant?: "static" | "route" | "searching" | "live";
  className?: string;
  /** 0-1 progress along the route, used by the "live" variant to place the vehicle marker */
  progress?: number;
}

// Fixed pseudo-random block layout so the map looks the same on every render
// (deterministic — avoids hydration mismatches from Math.random()).
const BLOCKS = [
  { x: 20, y: 30, w: 55, h: 40 },
  { x: 95, y: 20, w: 40, h: 60 },
  { x: 160, y: 40, w: 60, h: 35 },
  { x: 240, y: 25, w: 45, h: 50 },
  { x: 20, y: 100, w: 65, h: 45 },
  { x: 110, y: 110, w: 50, h: 40 },
  { x: 180, y: 105, w: 70, h: 50 },
  { x: 270, y: 100, w: 40, h: 45 },
  { x: 30, y: 180, w: 60, h: 40 },
  { x: 115, y: 185, w: 55, h: 35 },
  { x: 195, y: 175, w: 65, h: 45 },
  { x: 15, y: 250, w: 50, h: 35 },
  { x: 100, y: 245, w: 60, h: 40 },
  { x: 190, y: 240, w: 55, h: 45 },
  { x: 260, y: 250, w: 40, h: 30 },
];

const PICKUP = { x: 70, y: 210 };
const DROP = { x: 260, y: 60 };
const ROUTE_PATH = "M70,210 C110,190 90,150 130,130 C170,110 150,90 190,80 C220,70 235,65 260,60";

function RoadGrid() {
  return (
    <>
      {/* base */}
      <rect width="320" height="320" fill="#eef1ef" />
      {/* blocks (buildings) */}
      {BLOCKS.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="#e2e6e2" />
      ))}
      {/* roads — horizontal */}
      {[0, 90, 170, 250, 310].map((y, i) => (
        <rect key={`h${i}`} x={0} y={y} width={320} height={y === 0 || y === 310 ? 10 : 14} fill="#ffffff" />
      ))}
      {/* roads — vertical */}
      {[10, 95, 175, 255].map((x, i) => (
        <rect key={`v${i}`} x={x} y={0} width={12} height={320} fill="#ffffff" />
      ))}
    </>
  );
}

function PinMarker({ x, y, color, delay = 0 }: { x: number; y: number; color: string; delay?: number }) {
  return (
    <motion.g
      initial={{ y: y - 12, opacity: 0 }}
      animate={{ y, opacity: 1 }}
      transition={{ type: "spring", damping: 12, delay }}
    >
      <path
        d={`M${x},${y} c0,-14 -11,-14 -11,-26 a11,11 0 1 1 22,0 c0,12 -11,12 -11,26 z`}
        fill={color}
      />
      <circle cx={x} cy={y - 26} r={4} fill="white" />
    </motion.g>
  );
}

export function MockMap({ variant = "static", className, progress = 0.4 }: MockMapProps) {
  const routeLength = 260; // approximate path length for dash animation

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-border",
        className
      )}
    >
      <svg viewBox="0 0 320 320" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <RoadGrid />

        {(variant === "route" || variant === "live") && (
          <motion.path
            d={ROUTE_PATH}
            fill="none"
            stroke="var(--signal-blue)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={routeLength}
            initial={{ strokeDashoffset: routeLength }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        )}

        {variant === "searching" && (
          <g>
            {[0, 0.6, 1.2].map((delay) => (
              <motion.circle
                key={delay}
                cx={160}
                cy={160}
                r={10}
                fill="none"
                stroke="var(--signal-blue)"
                strokeWidth={2}
                initial={{ r: 10, opacity: 0.8 }}
                animate={{ r: 90, opacity: 0 }}
                transition={{ duration: 2, repeat: Infinity, delay, ease: "easeOut" }}
              />
            ))}
            <circle cx={160} cy={160} r={8} fill="var(--signal-blue)" />
          </g>
        )}

        {(variant === "route" || variant === "live" || variant === "searching") && (
          <>
            <PinMarker x={PICKUP.x} y={PICKUP.y} color="var(--meter-green)" />
            {variant !== "searching" && <PinMarker x={DROP.x} y={DROP.y} color="var(--alert-red)" delay={0.15} />}
          </>
        )}

        {variant === "static" && (
          <motion.g animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }}>
            <circle cx={160} cy={160} r={7} fill="var(--signal-blue)" fillOpacity={0.25} />
            <circle cx={160} cy={160} r={4} fill="var(--signal-blue)" />
          </motion.g>
        )}

        {variant === "live" && (
          <motion.g
            initial={{ offsetDistance: "0%" }}
            animate={{ offsetDistance: `${progress * 100}%` }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            style={{ offsetPath: `path('${ROUTE_PATH}')`, offsetRotate: "auto" }}
          >
            <circle r={7} fill="var(--ink-blue)" stroke="white" strokeWidth={2} />
          </motion.g>
        )}
      </svg>

      <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-ink-soft shadow-sm">
        Mock map preview
      </span>
    </div>
  );
}
