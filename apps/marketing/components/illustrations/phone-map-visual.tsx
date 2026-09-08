/**
 * A believable phone silhouette (CSS frame: bezel, notch, side buttons,
 * home indicator) with a small SVG map inside — not a generic rounded
 * rectangle. The route line uses the shared `.rd-route-path` draw-in
 * animation (theme.css), which resolves to "already drawn" under
 * prefers-reduced-motion.
 */
export function PhoneMapVisual({ className, animate = true }: { className?: string; animate?: boolean }) {
  return (
    <div className={`relative aspect-[9/18.5] w-full max-w-[220px] ${className ?? ""}`}>
      <div className="absolute inset-0 rounded-[2.2rem] bg-rd-navy shadow-rd-card-lg" />
      <div className="absolute inset-[6px] overflow-hidden rounded-[1.9rem] bg-white">
        {/* Notch */}
        <div className="absolute left-1/2 top-0 z-10 h-4 w-20 -translate-x-1/2 rounded-b-xl bg-rd-navy" />

        {/* Map surface */}
        <svg viewBox="0 0 200 410" className="absolute inset-0 h-full w-full" role="img" aria-label="Ridora map showing a pickup and drop route">
          <rect width="200" height="410" fill="#F1F6F4" />
          <g stroke="#DCE6E2" strokeWidth="10" fill="none">
            <path d="M-10 90 H210" />
            <path d="M-10 190 H210" />
            <path d="M40 -10 V420" />
            <path d="M150 -10 V420" />
          </g>
          <path
            className={animate ? "rd-route-path" : undefined}
            pathLength={1}
            d="M52 300 C 70 250, 60 190, 95 160 C 130 130, 120 90, 150 60"
            stroke="#0F8F78"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="52" cy="300" r="7" fill="#0B1628" />
          <circle cx="52" cy="300" r="3" fill="#fff" />
          <path d="M150 60 a9 9 0 1 0 0.01 0" fill="#0F8F78" />
          <path d="M150 48 l-7 12 h14 z" fill="#0F8F78" />
        </svg>

        {/* UI chrome overlay */}
        <div className="absolute inset-x-0 top-6 px-3">
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-rd-card">
            <span className="h-1.5 w-1.5 rounded-full bg-rd-teal" />
            <span className="font-body text-[10px] font-medium text-rd-gray">Where to?</span>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-8 flex flex-col gap-1.5 px-3">
          <div className="rounded-xl bg-white/95 px-3 py-1.5 shadow-rd-card">
            <p className="font-body text-[9px] font-semibold text-rd-navy">Home</p>
            <p className="font-body text-[8px] text-rd-gray">Saved address</p>
          </div>
          <div className="rounded-xl bg-rd-navy px-3 py-1.5">
            <p className="font-body text-[9px] font-semibold text-white">Confirm pickup</p>
          </div>
        </div>
        <div className="absolute bottom-1.5 left-1/2 h-1 w-16 -translate-x-1/2 rounded-full bg-rd-navy/20" />
      </div>
    </div>
  );
}
