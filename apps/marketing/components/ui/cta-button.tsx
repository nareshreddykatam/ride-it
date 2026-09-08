import * as React from "react";
import { ArrowRight } from "lucide-react";

/**
 * Marketing-only CTA button. Not a variant of @ride-it/ui's shared Button
 * (whose fixed variant palette is signal-blue/marigold and shared with
 * Passenger/Driver/Admin) — this app's palette is fundamentally different,
 * so it gets its own small, local primitive rather than forking the
 * shared component's color logic.
 */
type CtaVariant = "solid" | "outline" | "outline-light" | "ghost-light";
type CtaSize = "md" | "lg";

const VARIANT_CLASSES: Record<CtaVariant, string> = {
  solid: "bg-rd-teal text-white shadow-rd-cta hover:bg-rd-teal-dark",
  outline: "border border-rd-navy/15 text-rd-navy hover:border-rd-navy/35 hover:bg-rd-navy/[0.03]",
  "outline-light": "border border-white/35 text-white hover:border-white/70 hover:bg-white/10",
  "ghost-light": "text-white/90 hover:text-white",
};

const SIZE_CLASSES: Record<CtaSize, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-base",
};

export function CtaButton({
  href,
  variant = "solid",
  size = "lg",
  arrow = true,
  className,
  children,
}: {
  href: string;
  variant?: CtaVariant;
  size?: CtaSize;
  arrow?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-body font-semibold transition-all duration-150 ease-out active:scale-[0.98] ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className ?? ""}`}
    >
      {children}
      {arrow && <ArrowRight size={size === "lg" ? 18 : 16} aria-hidden="true" />}
    </a>
  );
}
