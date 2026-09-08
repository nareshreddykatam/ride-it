/**
 * Stylized driver figure — deliberately an illustrated silhouette, not an
 * attempt at a fake photograph of a real person. Rendering a convincing
 * photorealistic human in hand-authored SVG isn't achievable credibly, and
 * a fabricated "photo" of a nonexistent driver would misrepresent the
 * product more than an honest illustration does. Confident stance (arms
 * crossed), helmet at hand, city skyline behind — same lighting/shadow
 * language as the vehicle illustrations so it reads as one visual system.
 */
import { CitySkyline } from "./city-scene";

export function DriverVisual({ className }: { className?: string }) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="absolute inset-x-0 bottom-0 h-2/3 opacity-[0.08]">
        <CitySkyline className="h-full w-full" />
      </div>
      <svg viewBox="0 0 260 320" className="relative h-full w-full" role="img" aria-label="Ridora driver, ready to go">
        <defs>
          <linearGradient id="rd-driver-shirt" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#123B32" />
            <stop offset="1" stopColor="#0B1628" />
          </linearGradient>
          <linearGradient id="rd-driver-skin" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#C48A5E" />
            <stop offset="1" stopColor="#9C6B45" />
          </linearGradient>
        </defs>

        <ellipse cx="130" cy="300" rx="70" ry="12" fill="#0B1628" opacity="0.12" />

        {/* Helmet, resting beside the figure */}
        <g transform="translate(196,220)">
          <ellipse cx="0" cy="18" rx="30" ry="8" fill="#0B1628" opacity="0.14" />
          <path d="M-26 4 a26 26 0 0 1 52 0 v6 a10 10 0 0 1 -10 10 h-32 a10 10 0 0 1 -10 -10 Z" fill="#0F8F78" />
          <rect x="-20" y="2" width="40" height="10" rx="5" fill="#0B1628" opacity="0.35" />
          <circle cx="0" cy="-2" r="3" fill="#FFFFFF" opacity="0.7" />
        </g>

        {/* Legs */}
        <rect x="104" y="230" width="20" height="66" rx="8" fill="#16233A" />
        <rect x="140" y="230" width="20" height="66" rx="8" fill="#16233A" />

        {/* Torso */}
        <path d="M92 140 C92 118 112 104 132 104 C152 104 172 118 172 140 L176 232 C176 240 168 246 160 246 L104 246 C96 246 88 240 88 232 Z" fill="url(#rd-driver-shirt)" />

        {/* Crossed arms */}
        <path d="M96 156 C118 176 148 176 170 156 L166 182 C144 198 120 198 100 182 Z" fill="#0C2A24" />
        {/* Small chest logo */}
        <circle cx="132" cy="146" r="7" fill="#FFFFFF" opacity="0.9" />
        <circle cx="132" cy="146" r="3" fill="#0F8F78" />

        {/* Neck + head */}
        <rect x="122" y="90" width="20" height="20" fill="url(#rd-driver-skin)" />
        <circle cx="132" cy="72" r="30" fill="url(#rd-driver-skin)" />
        {/* Simple hair */}
        <path d="M102 66 a30 30 0 0 1 60 0 c0 -10 -10 -20 -30 -20 c-20 0 -30 10 -30 20 Z" fill="#241A12" />
      </svg>
    </div>
  );
}
