/**
 * The driver section is represented through their vehicle and a helmet
 * resting on its seat, not an illustrated human figure — a hand-authored
 * SVG person reads as exactly the "generic AI-illustrated human" this
 * redesign is trying to move away from, and a fabricated "photo" of a
 * nonexistent driver would misrepresent the product. The bike is grounded
 * on the same road/skyline language as the hero street scene, so it reads
 * as one consistent place rather than a decorative accent.
 */
import { RidoraBikeArt } from "./vehicles";

export function DriverVisual({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      <svg viewBox="0 0 700 560" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="rd-driver-road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#16233A" />
            <stop offset="1" stopColor="#0B1628" />
          </linearGradient>
        </defs>
        <rect width="700" height="560" fill="#0B1628" />
        <g opacity="0.14" fill="#FFFFFF">
          {[
            { x: 20, w: 60, h: 160 },
            { x: 100, w: 40, h: 220 },
            { x: 160, w: 70, h: 130 },
            { x: 260, w: 50, h: 240 },
            { x: 340, w: 90, h: 170 },
            { x: 460, w: 60, h: 200 },
            { x: 540, w: 80, h: 140 },
            { x: 640, w: 50, h: 210 },
          ].map((b, i) => (
            <rect key={i} x={b.x} y={330 - b.h} width={b.w} height={b.h} />
          ))}
        </g>
        <rect x="0" y="360" width="700" height="200" fill="url(#rd-driver-road)" />
        <g fill="#F7F9FA" opacity="0.35">
          {[30, 150, 270, 390, 510, 630].map((x) => (
            <rect key={x} x={x} y="388" width="42" height="5" rx="2.5" />
          ))}
        </g>
        <ellipse cx="350" cy="452" rx="130" ry="16" fill="#000000" opacity="0.3" style={{ filter: "blur(5px)" }} />
      </svg>

      <div className="absolute left-1/2 top-[42%] w-[46%] -translate-x-1/2">
        <RidoraBikeArt className="w-full" />
      </div>

      {/* Helmet resting beside the bike */}
      <div className="absolute left-[68%] top-[54%] w-[14%]">
        <svg viewBox="0 0 100 70" role="img" aria-label="A driver's helmet">
          <ellipse cx="50" cy="60" rx="34" ry="8" fill="#000000" opacity="0.2" />
          <path d="M14 40 a36 36 0 0 1 72 0 v8 a14 14 0 0 1 -14 14 H28 A14 14 0 0 1 14 48 Z" fill="#0F8F78" />
          <rect x="22" y="36" width="56" height="12" rx="6" fill="#0B1628" opacity="0.35" />
          <circle cx="50" cy="30" r="4" fill="#FFFFFF" opacity="0.7" />
        </svg>
      </div>
    </div>
  );
}
