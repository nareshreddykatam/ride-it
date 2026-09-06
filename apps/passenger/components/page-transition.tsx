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
  //
  // ROOT-CAUSE FIX (production-readiness audit): the above mitigation
  // reduced but did not eliminate the bug — live-reproduced navigating
  // /home -> /search: the entering page's own wrapper div rendered with
  // the EXIT preset's values frozen onto it (opacity:0, y:-6, matching
  // `exit` below exactly, not any valid `initial`/enter computation).
  // Root cause is `mode="wait"`: it holds the entering child unmounted
  // until AnimatePresence's onExitComplete fires for the previous child,
  // and that completion callback is what desynced — an interrupted or
  // superseded exit (e.g. two navigations in quick succession) can leave
  // AnimatePresence's internal bookkeeping applying the wrong child's
  // animation props. `mode="popLayout"` removes this dependency
  // entirely: the entering child mounts immediately and animates in on
  // its own, independent of whatever the exiting child's animation is
  // doing (which is pulled out of layout flow via position:absolute so
  // it doesn't visually displace the new content) — there is no
  // completion callback for the enter animation to ever get out of sync
  // with.
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
    <AnimatePresence mode="popLayout" initial={false}>
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
