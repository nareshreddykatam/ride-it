/**
 * Stylized city backdrop — background skyline, used at low opacity as an
 * atmospheric depth layer (hero) or fuller/warmer for the closing section.
 * Deliberately plain building silhouettes, not a futuristic/cyberpunk
 * skyline: flat rects at varying heights with a handful of lit windows.
 */
export function CitySkyline({ className, tone = "navy" }: { className?: string; tone?: "navy" | "teal" }) {
  const fill = tone === "navy" ? "#0B1628" : "#0C7561";
  const buildings = [
    { x: 0, w: 46, h: 92 },
    { x: 50, w: 30, h: 130 },
    { x: 84, w: 40, h: 74 },
    { x: 128, w: 26, h: 150 },
    { x: 158, w: 50, h: 100 },
    { x: 212, w: 34, h: 122 },
    { x: 250, w: 44, h: 84 },
    { x: 298, w: 28, h: 140 },
    { x: 330, w: 40, h: 96 },
  ];
  return (
    <svg viewBox="0 0 370 160" className={className} preserveAspectRatio="none" aria-hidden="true">
      <g fill={fill}>
        {buildings.map((b, i) => (
          <rect key={i} x={b.x} y={160 - b.h} width={b.w} height={b.h} rx="2" />
        ))}
      </g>
      <g fill="#F5C451" opacity="0.55">
        {buildings.flatMap((b, i) =>
          [0, 1, 2].map((row) => (
            <rect key={`${i}-${row}`} x={b.x + b.w * 0.25} y={160 - b.h + 14 + row * 22} width="4" height="6" />
          ))
        )}
      </g>
    </svg>
  );
}

/**
 * Foreground urban strip for the closing CTA: road with light traffic,
 * trees, and an elevated transit line — grounded daytime mobility, not a
 * sci-fi city. Kept intentionally simple/flat relative to the vehicle
 * illustrations, since it's a background element, not the visual focus.
 */
export function UrbanCloseScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 260" className={className} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="rd-close-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E9F7F2" />
          <stop offset="1" stopColor="#F7F9FA" />
        </linearGradient>
      </defs>
      <rect width="800" height="260" fill="url(#rd-close-sky)" />

      <g opacity="0.16">
        <CitySkylineInline />
      </g>

      {/* Elevated transit line */}
      <g stroke="#0B1628" strokeWidth="4" opacity="0.5">
        <line x1="0" y1="150" x2="800" y2="150" />
        {[60, 180, 300, 420, 540, 660, 760].map((x) => (
          <line key={x} x1={x} y1="150" x2={x} y2="190" />
        ))}
      </g>
      <rect x="230" y="132" width="120" height="20" rx="6" fill="#168A62" opacity="0.85" />
      <g fill="#E9F7F2">
        {[248, 274, 300, 326].map((x) => (
          <rect key={x} x={x} y="138" width="14" height="8" rx="1.5" />
        ))}
      </g>

      {/* Trees */}
      {[40, 130, 620, 720].map((x, i) => (
        <g key={x}>
          <rect x={x - 2} y="200" width="4" height="26" fill="#3A4A5F" />
          <circle cx={x} cy="196" r={i % 2 ? 16 : 20} fill="#168A62" opacity="0.85" />
        </g>
      ))}

      {/* Road */}
      <rect x="0" y="222" width="800" height="38" fill="#0B1628" />
      <g fill="#F7F9FA" opacity="0.7">
        {[40, 140, 240, 340, 440, 540, 640, 740].map((x) => (
          <rect key={x} x={x} y="239" width="36" height="4" rx="2" />
        ))}
      </g>

      {/* Light traffic — simplified silhouettes, distinct from the hero's
          detailed vehicle illustrations (this is a background element). */}
      <g>
        <rect x="120" y="200" width="60" height="20" rx="6" fill="#0F8F78" />
        <circle cx="134" cy="222" r="7" fill="#0B1628" />
        <circle cx="166" cy="222" r="7" fill="#0B1628" />
      </g>
      <g>
        <rect x="520" y="198" width="70" height="22" rx="6" fill="#FFFFFF" />
        <circle cx="536" cy="222" r="7" fill="#0B1628" />
        <circle cx="574" cy="222" r="7" fill="#0B1628" />
      </g>
    </svg>
  );
}

function CitySkylineInline() {
  const buildings = [
    { x: 0, w: 60, h: 120 },
    { x: 70, w: 40, h: 170 },
    { x: 120, w: 54, h: 96 },
    { x: 190, w: 36, h: 200 },
    { x: 240, w: 70, h: 132 },
    { x: 320, w: 46, h: 160 },
    { x: 380, w: 60, h: 110 },
    { x: 460, w: 40, h: 184 },
    { x: 520, w: 56, h: 126 },
    { x: 600, w: 44, h: 172 },
    { x: 660, w: 60, h: 110 },
    { x: 730, w: 50, h: 150 },
  ];
  return (
    <g fill="#0B1628">
      {buildings.map((b, i) => (
        <rect key={i} x={b.x} y={200 - b.h} width={b.w} height={b.h} />
      ))}
    </g>
  );
}
