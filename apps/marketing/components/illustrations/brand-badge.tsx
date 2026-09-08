/**
 * Small rotated "stamp" badge with a jagged (torn-paper) edge — a
 * lightweight brand-voice motif used sparingly (2-3 times on the page,
 * never as a repeated template pattern) to give Ridora a distinct feel
 * instead of reading as another generic SaaS landing page. The jagged
 * edge is a CSS clip-path polygon, not an image asset.
 */
export function BrandBadge({
  children,
  rotate = -4,
  className,
}: {
  children: React.ReactNode;
  rotate?: number;
  className?: string;
}) {
  return (
    <div
      className={`inline-block bg-rd-green px-5 py-3 text-center font-display text-sm italic leading-snug text-white shadow-rd-card ${className ?? ""}`}
      style={{
        transform: `rotate(${rotate}deg)`,
        clipPath:
          "polygon(2% 8%, 12% 2%, 24% 6%, 36% 1%, 48% 5%, 60% 0%, 74% 5%, 86% 1%, 98% 7%, 96% 22%, 100% 38%, 95% 52%, 99% 68%, 94% 82%, 98% 94%, 84% 99%, 70% 94%, 56% 99%, 42% 95%, 28% 99%, 14% 94%, 2% 98%, 5% 82%, 0% 66%, 4% 50%, 0% 34%, 5% 20%)",
      }}
    >
      {children}
    </div>
  );
}
