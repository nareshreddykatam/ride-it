/**
 * Depth-layered vehicle illustrations for the Marketing site only.
 *
 * The silhouette geometry (body/wheel/detail path data) is reused from
 * @ride-it/ui's vehicle-icons.tsx — those paths were already crafted for
 * "immediate real-world recognizability" and are shared across every app's
 * flat, single-color icon usage (fare cards, vehicle pickers, etc). Rather
 * than hand-authoring new geometry from scratch (high risk of looking
 * worse), each vehicle here reuses the exact same path data scaled 4x into
 * a bigger canvas, then adds what the flat icon deliberately doesn't need:
 * a gradient body fill (simulated top-left light source, consistent across
 * all four), a soft blurred ground shadow, a clipped sheen highlight, and
 * — for the Car and Auto, whose body path already punches window cutouts
 * via an evenodd fill rule — a dark tinted-glass rect placed behind the
 * body so those cutouts read as real windows instead of transparent holes.
 *
 * Realistic, not brand-painted: vehicle bodies use real-world colors
 * (white car, navy motorcycle, white scooter, yellow-green auto — the
 * actual, common Indian auto-rickshaw livery) with one small teal Ridora
 * badge decal each, rather than painting every vehicle teal. The BRAND's
 * teal/navy/green identity lives in the UI chrome around these vehicles
 * (buttons, cards, backgrounds, route lines), not on the vehicles
 * themselves — consistent with how real ride-hailing marketing sites
 * depict real vehicles without repainting them in brand colors.
 */
import * as React from "react";

function RidoraBadge({ cx, cy, r = 5.5 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#0F8F78" stroke="#FFFFFF" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={r * 0.34} fill="#FFFFFF" />
    </g>
  );
}

function GroundShadow({ cx, rx = 78, cy = 152 }: { cx: number; rx?: number; cy?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry="9" fill="#0B1628" opacity="0.16" style={{ filter: "blur(5px)" }} />;
}

const FRAME = "0 0 240 170";

export function RidoraBikeArt({ className }: { className?: string }) {
  return (
    <svg viewBox={FRAME} className={className} role="img" aria-label="Ridora motorcycle">
      <defs>
        <linearGradient id="rd-bike-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2B3B52" />
          <stop offset="1" stopColor="#0B1628" />
        </linearGradient>
        <linearGradient id="rd-bike-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id="rd-bike-clip">
          <path
            transform="translate(21,24) scale(4)"
            d="M17 11.5 C19 8.5 24 8.5 27.5 11.5 C29 13 29 15.5 27.5 16.5 L18 15.5 Z M26.5 14.5 C28.5 13.5 32 13 36 13 C38.5 13 41.5 14 43 15.5 L43 18 C39.5 18 34 18 26.5 17 Z M19 17.5 L27 17.5 L26.5 24.5 L18.5 24.5 Z"
          />
        </clipPath>
      </defs>

      <GroundShadow cx={120} />

      <g transform="translate(21,24) scale(4)" fill="url(#rd-bike-body)">
        <path d="M9.5 26.5 L16.5 9.5 M14 9 L18 10 M12.5 12 L15.5 13" stroke="url(#rd-bike-body)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M17 11.5 C19 8.5 24 8.5 27.5 11.5 C29 13 29 15.5 27.5 16.5 L18 15.5 Z" />
        <path d="M26.5 14.5 C28.5 13.5 32 13 36 13 C38.5 13 41.5 14 43 15.5 L43 18 C39.5 18 34 18 26.5 17 Z" />
        <path d="M19 17.5 L27 17.5 L26.5 24.5 L18.5 24.5 Z" />
        <line x1="20" y1="20" x2="25.5" y2="20" stroke="#E9F7F2" strokeWidth="1.1" />
        <line x1="20" y1="22.5" x2="25.5" y2="22.5" stroke="#E9F7F2" strokeWidth="1.1" />
        <path d="M26 23.5 L42.5 25 C43.5 25 44 25.6 44 26.2 C44 27 43.2 27.5 42.2 27.2 L26 25 Z" fill="#C7CFD6" />
        <path d="M5.5 23.5 C6.5 19.5 10.5 19.5 13.5 21.5" stroke="url(#rd-bike-body)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <path d="M26 22 L38.5 26.5" stroke="url(#rd-bike-body)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <circle cx="9.5" cy="26.5" r="5" fill="#161E2B" />
        <circle cx="9.5" cy="26.5" r="2.2" fill="#8A98A6" />
        <circle cx="38.5" cy="26.5" r="5" fill="#161E2B" />
        <circle cx="38.5" cy="26.5" r="2.2" fill="#8A98A6" />
      </g>

      <rect x="60" y="90" width="150" height="40" fill="url(#rd-bike-sheen)" clipPath="url(#rd-bike-clip)" />
      <RidoraBadge cx={148} cy={106} />
    </svg>
  );
}

export function RidoraScootyArt({ className }: { className?: string }) {
  return (
    <svg viewBox={FRAME} className={className} role="img" aria-label="Ridora scooter">
      <defs>
        <linearGradient id="rd-scooty-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#C9D3D9" />
        </linearGradient>
        <linearGradient id="rd-scooty-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id="rd-scooty-clip">
          <path
            transform="translate(23,26) scale(4)"
            d="M23.5 23 C24 17.5 26.5 14.5 30.5 14.5 C35.5 14.5 40.5 16.8 42 20.5 C42.5 22 42.5 23.8 41.5 25 L38.5 25 C38 22.8 35.5 21.2 32.5 21.2 C29.5 21.2 27.2 22.8 26.8 24.5 L23.5 23 Z"
          />
        </clipPath>
      </defs>

      <GroundShadow cx={120} />

      <g transform="translate(23,26) scale(4)" fill="url(#rd-scooty-body)" stroke="url(#rd-scooty-body)">
        <path d="M14.5 8 L17.5 8.5 M16 8.5 L17 11.5" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d="M16.5 9.5 C15 13.5 11 16.5 10 19.5 C9.5 21.5 10.5 23.5 12 24.5 L15 24.5 L14 18.5 C15.2 15.5 17.5 12.5 18.5 9.5 Z" stroke="none" />
        <path d="M6 24 C7 20.5 10.5 20.5 12.5 22.5" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <rect x="13.5" y="22.5" width="10.5" height="2.5" rx="1" stroke="none" />
        <path d="M23.5 23 C24 17.5 26.5 14.5 30.5 14.5 C35.5 14.5 40.5 16.8 42 20.5 C42.5 22 42.5 23.8 41.5 25 L38.5 25 C38 22.8 35.5 21.2 32.5 21.2 C29.5 21.2 27.2 22.8 26.8 24.5 L23.5 23 Z" stroke="none" />
        <path d="M23 15 C24 13.2 28.5 13.2 34.5 13.2 C36.5 13.2 37.5 13.8 38 14.8 L23 15 Z" fill="#1B2027" stroke="none" />
        <path d="M36.5 12.5 C38.5 11.5 40.5 12.2 41.5 13.8" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <circle cx="9.5" cy="26.5" r="4.5" fill="#161E2B" stroke="none" />
        <circle cx="9.5" cy="26.5" r="1.8" fill="#8A98A6" stroke="none" />
        <circle cx="36.5" cy="26.5" r="4.5" fill="#161E2B" stroke="none" />
        <circle cx="36.5" cy="26.5" r="1.8" fill="#8A98A6" stroke="none" />
      </g>

      <rect x="55" y="90" width="150" height="36" fill="url(#rd-scooty-sheen)" clipPath="url(#rd-scooty-clip)" />
      <RidoraBadge cx={130} cy={108} />
    </svg>
  );
}

export function RidoraAutoArt({ className }: { className?: string }) {
  return (
    <svg viewBox={FRAME} className={className} role="img" aria-label="Ridora auto rickshaw">
      <defs>
        <linearGradient id="rd-auto-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD84D" />
          <stop offset="1" stopColor="#E8A400" />
        </linearGradient>
        <linearGradient id="rd-auto-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id="rd-auto-clip">
          <path
            transform="translate(24,24) scale(4)"
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12.5 7.5 C11 7.5 9.5 8.5 8.5 10 L6.5 13 C5.8 14.2 5.8 15.5 6.2 16.8 L7.8 20.5 C8.2 21.6 9 22.4 10.2 22.7 L10.2 24 C10.2 25.2 11 26 12.2 26 L15 26 L15 24 L22 24 L22 26 L29.5 26 C29.8 24.2 31.4 22.8 33.5 22.8 C35.6 22.8 37.2 24.2 37.5 26 L41 26 C42.2 26 43 25 43 23.8 L43 17 C43 11.5 39.5 7.5 33.5 7.5 L12.5 7.5 Z"
          />
        </clipPath>
      </defs>

      <GroundShadow cx={120} />

      {/* Tinted glass, painted behind the body so the body's own evenodd
          window cutouts (front/cabin/rear) read as real dark windows. */}
      <g transform="translate(24,24) scale(4)">
        <rect x="9" y="10" width="32" height="13" fill="#16233A" />
      </g>

      <g transform="translate(24,24) scale(4)" fill="url(#rd-auto-body)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12.5 7.5 C11 7.5 9.5 8.5 8.5 10 L6.5 13 C5.8 14.2 5.8 15.5 6.2 16.8 L7.8 20.5 C8.2 21.6 9 22.4 10.2 22.7 L10.2 24 C10.2 25.2 11 26 12.2 26 L15 26 L15 24 L22 24 L22 26 L29.5 26 C29.8 24.2 31.4 22.8 33.5 22.8 C35.6 22.8 37.2 24.2 37.5 26 L41 26 C42.2 26 43 25 43 23.8 L43 17 C43 11.5 39.5 7.5 33.5 7.5 L12.5 7.5 Z M10.8 10.5 L18 10.5 L17 16.5 L9 16.5 L10.8 10.5 Z M19.8 10.5 L31.5 10.5 L31.5 22 L18.5 22 L18.8 17.5 L19.8 10.5 Z M33.5 10.5 L34.5 10.5 C37.8 10.5 39.8 13 40.2 16.2 L40.2 17.8 L33.5 17.8 L33.5 10.5 Z"
        />
        <path d="M12 23 L15.5 18 M14 17.5 L16.5 18" stroke="#B87F00" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="10" cy="27" r="4.5" fill="#161E2B" />
        <circle cx="10" cy="27" r="1.8" fill="#8A98A6" />
        <circle cx="33.5" cy="27" r="4.5" fill="#161E2B" />
        <circle cx="33.5" cy="27" r="1.8" fill="#8A98A6" />
        <path d="M6 24 C6 21.5 8 19.8 10.5 19.8" stroke="#B87F00" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <circle cx="6.5" cy="18" r="1.2" fill="#FFF3C4" />
      </g>

      <rect x="60" y="88" width="140" height="34" fill="url(#rd-auto-sheen)" clipPath="url(#rd-auto-clip)" />
      <RidoraBadge cx={162} cy={112} />
    </svg>
  );
}

export function RidoraCarArt({ className }: { className?: string }) {
  return (
    <svg viewBox={FRAME} className={className} role="img" aria-label="Ridora car">
      <defs>
        <linearGradient id="rd-car-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D3DBE0" />
        </linearGradient>
        <linearGradient id="rd-car-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.7" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id="rd-car-clip">
          <path
            transform="translate(21,25) scale(4)"
            fillRule="evenodd"
            clipRule="evenodd"
            d="M3 23.5 L3 20.5 C3 19.5 3.8 19 5.5 19 L13 19 L18 9.5 C19.2 8 21.5 7.5 24 7.5 L31 7.5 C33.5 7.5 35.2 8.5 36.8 10.5 L40.5 17 L44 17.5 C45.5 18 46.5 19.2 46.5 20.8 L46.5 23.5 C46.5 24.8 45.5 25.8 44.2 25.8 L40.5 25.8 C40.2 23.8 38.5 22.2 36 22.2 C33.5 22.2 31.8 23.8 31.5 25.8 L16.5 25.8 C16.2 23.8 14.5 22.2 12 22.2 C9.5 22.2 7.8 23.8 7.5 25.8 L4.8 25.8 C3.8 25.8 3 24.8 3 23.5 Z"
          />
        </clipPath>
      </defs>

      <GroundShadow cx={122} rx={86} />

      <g transform="translate(21,25) scale(4)">
        <rect x="13.5" y="9.5" width="23" height="8" fill="#16233A" />
      </g>

      <g transform="translate(21,25) scale(4)" fill="url(#rd-car-body)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M3 23.5 L3 20.5 C3 19.5 3.8 19 5.5 19 L13 19 L18 9.5 C19.2 8 21.5 7.5 24 7.5 L31 7.5 C33.5 7.5 35.2 8.5 36.8 10.5 L40.5 17 L44 17.5 C45.5 18 46.5 19.2 46.5 20.8 L46.5 23.5 C46.5 24.8 45.5 25.8 44.2 25.8 L40.5 25.8 C40.2 23.8 38.5 22.2 36 22.2 C33.5 22.2 31.8 23.8 31.5 25.8 L16.5 25.8 C16.2 23.8 14.5 22.2 12 22.2 C9.5 22.2 7.8 23.8 7.5 25.8 L4.8 25.8 C3.8 25.8 3 24.8 3 23.5 Z M14.5 16.5 L18.5 10.2 L25 10.2 L25 16.5 L14.5 16.5 Z M26.8 10.2 L31 10.2 L35.5 16.5 L26.8 16.5 L26.8 10.2 Z"
        />
        <path d="M4 19.5 L6.5 19.5" stroke="#0F8F78" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M44.5 18.5 L46 18.5" stroke="#0F8F78" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="12" cy="26.5" r="4.8" fill="#161E2B" />
        <circle cx="12" cy="26.5" r="2" fill="#8A98A6" />
        <circle cx="36" cy="26.5" r="4.8" fill="#161E2B" />
        <circle cx="36" cy="26.5" r="2" fill="#8A98A6" />
      </g>

      <rect x="55" y="85" width="170" height="40" fill="url(#rd-car-sheen)" clipPath="url(#rd-car-clip)" />
      <RidoraBadge cx={150} cy={108} />
    </svg>
  );
}

export type VehicleKind = "bike" | "scooty" | "auto" | "car";

export const VEHICLE_ART: Record<VehicleKind, React.ComponentType<{ className?: string }>> = {
  bike: RidoraBikeArt,
  scooty: RidoraScootyArt,
  auto: RidoraAutoArt,
  car: RidoraCarArt,
};
