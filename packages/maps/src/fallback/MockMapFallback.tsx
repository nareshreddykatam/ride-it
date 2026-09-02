"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@ride-it/ui";

export interface MockMapProps {
  variant?: "static" | "route" | "searching" | "live";
  className?: string;
  /** 0-1 progress along the route, used by the "live" variant to place the vehicle marker */
  progress?: number;
  vehicleAccent?: string;
}

// Urban block grid with realistic city layout and waterways (representing Krishna River/Canals in Vijayawada)
const CITY_BLOCKS = [
  { x: 15, y: 20, w: 60, h: 42, rx: 6 },
  { x: 90, y: 15, w: 55, h: 50, rx: 6 },
  { x: 160, y: 25, w: 65, h: 40, rx: 6 },
  { x: 240, y: 15, w: 65, h: 50, rx: 6 },
  { x: 15, y: 80, w: 70, h: 48, rx: 6 },
  { x: 100, y: 85, w: 55, h: 45, rx: 6 },
  { x: 175, y: 80, w: 75, h: 50, rx: 6 },
  { x: 265, y: 85, w: 45, h: 45, rx: 6 },
  { x: 20, y: 150, w: 65, h: 45, rx: 6 },
  { x: 105, y: 155, w: 60, h: 40, rx: 6 },
  { x: 185, y: 148, w: 70, h: 50, rx: 6 },
  { x: 10, y: 220, w: 55, h: 45, rx: 6 },
  { x: 80, y: 215, w: 75, h: 48, rx: 6 },
  { x: 175, y: 218, w: 60, h: 48, rx: 6 },
  { x: 250, y: 220, w: 58, h: 44, rx: 6 },
  { x: 20, y: 285, w: 85, h: 25, rx: 4 },
  { x: 125, y: 285, w: 90, h: 25, rx: 4 },
  { x: 235, y: 285, w: 75, h: 25, rx: 4 },
];

const PICKUP = { x: 65, y: 240 };
const DROP = { x: 265, y: 55 };
const ROUTE_PATH = "M65,240 C105,215 95,175 140,150 C180,125 160,95 205,80 C235,70 245,65 265,55";

function MapEnvironment() {
  return (
    <>
      {/* Background Asphalt Canvas */}
      <rect width="320" height="320" fill="#0c1628" />

      {/* Subtle river / waterway curve */}
      <path
        d="M -10,310 C 80,290 140,305 220,295 C 280,285 310,300 340,295 L 340,340 L -10,340 Z"
        fill="#081e3a"
        opacity="0.75"
      />

      {/* Urban Building / Block Parcels */}
      {CITY_BLOCKS.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={b.rx}
          fill="#13233c"
          stroke="#1b3050"
          strokeWidth="0.8"
        />
      ))}

      {/* Secondary Streets */}
      {[0, 70, 140, 205, 275].map((y, i) => (
        <rect key={`sh_${i}`} x={0} y={y} width={320} height={7} fill="#182c49" />
      ))}
      {[0, 80, 165, 245].map((x, i) => (
        <rect key={`sv_${i}`} x={x} y={0} width={7} height={320} fill="#182c49" />
      ))}

      {/* Major Arterial Roads / Expressways */}
      <path d="M 0,142 L 320,142" stroke="#223b63" strokeWidth="12" fill="none" />
      <path d="M 0,142 L 320,142" stroke="#2f4e82" strokeWidth="1" strokeDasharray="6,6" fill="none" />

      <path d="M 167,0 L 167,320" stroke="#223b63" strokeWidth="12" fill="none" />
      <path d="M 167,0 L 167,320" stroke="#2f4e82" strokeWidth="1" strokeDasharray="6,6" fill="none" />

      {/* Curved Avenue */}
      <path
        d="M 10,290 Q 140,240 310,90"
        stroke="#1a3256"
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

function PinBeacon({
  x,
  y,
  color,
  label,
  delay = 0,
}: {
  x: number;
  y: number;
  color: string;
  label?: string;
  delay?: number;
}) {
  return (
    <motion.g
      initial={{ y: y - 16, opacity: 0 }}
      animate={{ y, opacity: 1 }}
      transition={{ type: "spring", damping: 14, stiffness: 220, delay }}
    >
      {/* Pulse wave halo */}
      <circle cx={x} cy={y} r={16} fill={color} opacity="0.25">
        <animate attributeName="r" values="8;22;8" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite" />
      </circle>

      {/* Pin Shadow */}
      <ellipse cx={x} cy={y + 1} rx="5" ry="2.5" fill="#000000" opacity="0.5" />

      {/* Teardrop Pin */}
      <path
        d={`M${x},${y} c0,-11 -9,-11 -9,-20 a9,9 0 1 1 18,0 c0,9 -9,9 -9,20 z`}
        fill={color}
        stroke="#ffffff"
        strokeWidth="1.5"
      />
      <circle cx={x} cy={y - 20} r="3.2" fill="#ffffff" />

      {label && (
        <text
          x={x}
          y={y - 32}
          textAnchor="middle"
          fill="#ffffff"
          fontSize="9"
          fontWeight="600"
          fontFamily="sans-serif"
          className="drop-shadow-md"
        >
          {label}
        </text>
      )}
    </motion.g>
  );
}

export function MockMap({
  variant = "static",
  className,
  progress = 0.4,
  vehicleAccent = "var(--marigold)",
}: MockMapProps) {
  const routeLength = 320;
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#0c1628] shadow-inner",
        className
      )}
    >
      <svg viewBox="0 0 320 320" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <MapEnvironment />

        {/* Route Line with dynamic glowing trail */}
        {(variant === "route" || variant === "live") && (
          <>
            {/* Route Glow Underlay */}
            <path
              d={ROUTE_PATH}
              fill="none"
              stroke="#1e6fef"
              strokeWidth={10}
              strokeOpacity={0.3}
              strokeLinecap="round"
            />
            {/* Main Polyline */}
            <motion.path
              d={ROUTE_PATH}
              fill="none"
              stroke="#1e6fef"
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeDasharray={routeLength}
              initial={reduceMotion ? { strokeDashoffset: 0 } : { strokeDashoffset: routeLength }}
              animate={{ strokeDashoffset: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 1.2, ease: "easeOut" }}
            />
            {/* Luminous Core Dash */}
            <motion.path
              d={ROUTE_PATH}
              fill="none"
              stroke="#93c5fd"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="8, 12"
              animate={reduceMotion ? undefined : { strokeDashoffset: [0, -40] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          </>
        )}

        {/* Searching Radar Scanner */}
        {variant === "searching" && (
          <g>
            {!reduceMotion ? (
              [0, 0.7, 1.4].map((delay) => (
                <motion.circle
                  key={delay}
                  cx={160}
                  cy={160}
                  r={12}
                  fill="none"
                  stroke={vehicleAccent}
                  strokeWidth={2}
                  initial={{ r: 12, opacity: 0.8 }}
                  animate={{ r: 100, opacity: 0 }}
                  transition={{ duration: 2.4, repeat: Infinity, delay, ease: "easeOut" }}
                />
              ))
            ) : (
              <circle cx={160} cy={160} r={60} fill="none" stroke={vehicleAccent} strokeWidth={2} opacity={0.4} />
            )}
            <circle cx={160} cy={160} r={28} fill="#14244d" stroke={vehicleAccent} strokeWidth={2} />
            <circle cx={160} cy={160} r={9} fill={vehicleAccent} />
          </g>
        )}

        {/* Pickup & Destination Beacon Pins */}
        {(variant === "route" || variant === "live" || variant === "searching") && (
          <>
            <PinBeacon x={PICKUP.x} y={PICKUP.y} color="#1c9b6b" label="Pickup" />
            {variant !== "searching" && <PinBeacon x={DROP.x} y={DROP.y} color="#d6493b" label="Drop" delay={0.2} />}
          </>
        )}

        {/* Static Map GPS Pulse Dot */}
        {variant === "static" && (
          <g>
            {!reduceMotion && (
              <motion.circle
                cx={160}
                cy={160}
                r={10}
                fill="none"
                stroke="#1e6fef"
                strokeWidth={2}
                initial={{ r: 10, opacity: 0.8 }}
                animate={{ r: 42, opacity: 0 }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <circle cx={160} cy={160} r={14} fill="#1e6fef" fillOpacity={0.25} />
            <circle cx={160} cy={160} r={7} fill="#1e6fef" stroke="#ffffff" strokeWidth="2" />
          </g>
        )}

        {/* Moving Live Driver Marker along Route */}
        {variant === "live" && (
          <motion.g
            initial={{ offsetDistance: "0%" }}
            animate={{ offsetDistance: `${Math.min(1, Math.max(0, progress)) * 100}%` }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
            style={{ offsetPath: `path('${ROUTE_PATH}')`, offsetRotate: "auto" }}
          >
            {/* Driver Pulse Halo */}
            <circle r={18} fill="#f5a623" opacity="0.3">
              <animate attributeName="r" values="10;22;10" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite" />
            </circle>
            {/* Vehicle Disc */}
            <circle r={12} fill="#0b1b36" stroke="#f5a623" strokeWidth={2.5} />
            {/* Inner Heading Dot */}
            <circle cx={3} cy={0} r={3.5} fill="#f5a623" />
          </motion.g>
        )}
      </svg>

      {/* Map Badge */}
      <span className="pointer-events-none absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0c1628]/90 px-2.5 py-1 text-[10px] font-medium text-white/75 shadow-md backdrop-blur-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-meter-green" aria-hidden="true" />
        Ridora Live Spatial Context
      </span>
    </div>
  );
}
