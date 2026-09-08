import { RidoraAutoArt } from "./vehicles";

/**
 * One grounded, cohesive street scene — replaces the previous hero's
 * separately-floating car/phone/badge collage, which was the single
 * biggest reason the site read as an AI-generated product demo rather
 * than a real place. Everything here shares one ground plane (the road)
 * and one horizon line: sky → skyline → road → a single vehicle, its own
 * shadow anchoring it in place. No UI chrome, no cards, no floating
 * objects. The background (sky/skyline/road) and the vehicle are two
 * sibling elements positioned with plain CSS rather than one nested SVG,
 * so the vehicle's own `<defs>` ids never have to interact with a parent
 * SVG's coordinate space.
 */
export function HeroStreetScene({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      <svg viewBox="0 0 900 1000" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="rd-street-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#EAF6F1" />
            <stop offset="1" stopColor="#F7F9FA" />
          </linearGradient>
          <linearGradient id="rd-street-road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#16233A" />
            <stop offset="1" stopColor="#0B1628" />
          </linearGradient>
        </defs>

        <rect width="900" height="1000" fill="url(#rd-street-sky)" />

        {/* Skyline, well back on the horizon */}
        <g opacity="0.13" fill="#0B1628">
          {[
            { x: -20, w: 90, h: 200 },
            { x: 80, w: 60, h: 280 },
            { x: 150, w: 100, h: 160 },
            { x: 260, w: 70, h: 320 },
            { x: 340, w: 120, h: 220 },
            { x: 470, w: 80, h: 260 },
            { x: 560, w: 100, h: 180 },
            { x: 670, w: 70, h: 300 },
            { x: 750, w: 110, h: 210 },
            { x: 860, w: 80, h: 240 },
          ].map((b, i) => (
            <rect key={i} x={b.x} y={520 - b.h} width={b.w} height={b.h} />
          ))}
        </g>

        {/* Roadside trees, uneven spacing — not a repeated pattern */}
        {[
          { x: 60, r: 34 },
          { x: 170, r: 26 },
          { x: 700, r: 30 },
          { x: 820, r: 24 },
        ].map((t, i) => (
          <g key={i}>
            <rect x={t.x - 4} y={520 - t.r * 0.4} width="8" height="70" fill="#3A4A5F" />
            <circle cx={t.x} cy={520 - t.r * 0.4} r={t.r} fill="#168A62" opacity="0.9" />
          </g>
        ))}

        {/* Road, filling the lower portion */}
        <rect x="0" y="560" width="900" height="440" fill="url(#rd-street-road)" />
        <g fill="#F7F9FA" opacity="0.55">
          {[40, 160, 280, 400, 520, 640, 760].map((x) => (
            <rect key={x} x={x} y="590" width="52" height="6" rx="3" />
          ))}
        </g>

        {/* Ground shadow beneath the vehicle, on the same plane as the road */}
        <ellipse cx="450" cy="700" rx="150" ry="20" fill="#000000" opacity="0.22" style={{ filter: "blur(6px)" }} />
      </svg>

      {/* The vehicle — one confident, grounded subject, positioned to sit
          exactly on the road/shadow drawn above. */}
      <div className="absolute left-1/2 top-[56%] w-[46%] -translate-x-1/2">
        <RidoraAutoArt className="w-full" />
      </div>
    </div>
  );
}
