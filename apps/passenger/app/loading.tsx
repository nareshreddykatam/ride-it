import { PageLoader } from "@ride-it/ui";

/**
 * Root-segment loading fallback — shown by Next.js while a route segment's
 * RSC payload/JS chunk is being fetched during navigation, whenever no
 * more specific loading.tsx exists for that segment. Without this file,
 * that gap rendered nothing (no error, no fallback — literally blank),
 * which combined with PageTransition's AnimatePresence already starting
 * the previous page's exit animation on pathname change produced the
 * reported "URL changes, page goes blank, shell may remain" white-screen
 * bug. This never hides a real error — error.tsx remains the boundary
 * for actual thrown exceptions.
 */
export default function Loading() {
  return <PageLoader />;
}
