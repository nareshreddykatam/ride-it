/**
 * Dimensional safety shield: a darker offset backing panel (depth), a
 * glass-like front panel with a directional gradient + diagonal sheen
 * highlight, and a checkmark — reads as a physical object, not a flat icon.
 * Uses the restrained blue reserved for safety/technology elements only.
 */
export function SafetyShieldArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 220" className={className} role="img" aria-label="Ridora safety shield">
      <defs>
        <linearGradient id="rd-shield-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0B1628" />
          <stop offset="1" stopColor="#0B1628" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="rd-shield-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B9FE0" />
          <stop offset="0.55" stopColor="#1677C8" />
          <stop offset="1" stopColor="#0F5A9C" />
        </linearGradient>
        <linearGradient id="rd-shield-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id="rd-shield-clip">
          <path d="M100 14 L162 36 V96 C162 142 136 176 100 196 C64 176 38 142 38 96 V36 Z" />
        </clipPath>
        <filter id="rd-shield-shadow" x="-40%" y="-20%" width="180%" height="150%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#0B1628" floodOpacity="0.28" />
        </filter>
      </defs>

      <g filter="url(#rd-shield-shadow)">
        {/* Backing panel, offset for depth */}
        <path d="M108 24 L172 47 V104 C172 148 146 180 108 200 V24 Z" fill="url(#rd-shield-back)" opacity="0.9" />
        {/* Front glass panel */}
        <path d="M100 14 L162 36 V96 C162 142 136 176 100 196 C64 176 38 142 38 96 V36 Z" fill="url(#rd-shield-front)" />
        <rect x="20" y="10" width="90" height="200" fill="url(#rd-shield-sheen)" clipPath="url(#rd-shield-clip)" />
        <path d="M100 14 L162 36 V96 C162 142 136 176 100 196" fill="none" stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="2" />
      </g>

      <path
        d="M78 100 L94 118 L126 78"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
