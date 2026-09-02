"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

// The booking flow's real step order — used only to decide transition
// DIRECTION (forward = deeper into the flow, back = returning), never to
// change routing itself. Screens outside this list (profile, settings,
// history…) fall back to a plain fade, since "forward/back" has no
// meaning for them.
const FLOW_ORDER = ["/home", "/search", "/booking/confirm", "/booking/matching", "/booking", "/ride"];
const SORTED_BY_SPECIFICITY = [...FLOW_ORDER].sort((a, b) => b.length - a.length);

function flowDepth(pathname: string): number {
  for (const prefix of SORTED_BY_SPECIFICITY) {
    if (pathname.startsWith(prefix)) return FLOW_ORDER.indexOf(prefix);
  }
  return -1;
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prevPathRef = React.useRef<string>(pathname);
  const prevDepthRef = React.useRef<number>(flowDepth(pathname));
  const reduceMotion = useReducedMotion();

  // Only the ENTERING page's direction is trusted — it's computed on a
  // normal fresh render, so it's always correct. The exiting page (see
  // below) intentionally does NOT try to react to this same value: by
  // the time a route changes, the old motion.div has already left the
  // render tree and AnimatePresence is animating a frozen copy of its
  // last props, not a live re-render — attempting to "push" a new
  // direction into that frozen exit animation is exactly the pattern
  // that produced a real bug here (the entering page ended up stuck at
  // opacity:0 instead of animating in). A plain fade-out on exit avoids
  // that fragile path entirely while keeping the direction cue where it
  // reads clearest: the incoming page sliding in from the correct side.
  const direction = React.useMemo(() => {
    if (prevPathRef.current === pathname) return 0;
    const currentDepth = flowDepth(pathname);
    const prevDepth = prevDepthRef.current;
    return prevDepth === -1 || currentDepth === -1 ? 0 : Math.sign(currentDepth - prevDepth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  React.useEffect(() => {
    prevPathRef.current = pathname;
    prevDepthRef.current = flowDepth(pathname);
  }, [pathname]);

  const enterX = direction > 0 ? 28 : direction < 0 ? -28 : 0;
  const enterY = direction === 0 ? 10 : 0;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: enterX, y: enterY }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: "easeOut" }}
        className="flex flex-1 flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
