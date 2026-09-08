"use client";

import * as React from "react";

/**
 * Minimal scroll-reveal: adds `.rd-in` (see theme.css) the first time the
 * element crosses into the viewport, then disconnects — no continuous
 * scroll listener, no re-triggering on scroll-back. prefers-reduced-motion
 * is handled entirely in CSS (theme.css forces `.rd-reveal` to its
 * resting/visible state), so this component doesn't need to branch on it.
 */
export function Reveal({
  as: Tag = "div",
  delayMs = 0,
  className,
  children,
}: {
  as?: React.ElementType;
  delayMs?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(el);
    // Safety net: a backgrounded tab (opened in a new tab and not yet
    // switched to, or a browser that throttles IntersectionObserver while
    // hidden) can delay the callback indefinitely — content must never be
    // permanently stuck invisible waiting for it.
    const fallback = setTimeout(() => setVisible(true), 1500);
    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  return (
    <Tag
      ref={ref}
      className={`rd-reveal ${visible ? "rd-in" : ""} ${className ?? ""}`}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
