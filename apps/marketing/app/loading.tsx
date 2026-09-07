import { PageLoader } from "@ride-it/ui";

/**
 * Root-segment loading fallback — see apps/passenger/app/loading.tsx for
 * the full root-cause explanation (white-screen-on-navigation fix). Added
 * here for consistency; marketing was missed when this was rolled out to
 * the other three apps.
 */
export default function Loading() {
  return <PageLoader />;
}
