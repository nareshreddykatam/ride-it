import { PageLoader } from "@ride-it/ui";

/**
 * Root-segment loading fallback — see apps/passenger/app/loading.tsx for
 * the full root-cause explanation (white-screen-on-navigation fix).
 */
export default function Loading() {
  return <PageLoader />;
}
