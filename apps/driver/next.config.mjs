/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ride-it/ui", "@ride-it/types", "@ride-it/api-client"],
  reactStrictMode: true,
  images: { unoptimized: true },
  // NOTE (Phase 4.5 fix): `output: "export"` was removed. Next.js Middleware
  // (added this phase for auth route protection) cannot run at all under
  // static export — `next build` fails outright with the two combined. No
  // native build pipeline consumes the static "out/" folder yet anyway (no
  // ios/ or android/ project exists — capacitor.config.ts is prepared but
  // `cap add` was never run). When the real native build is set up, prefer
  // Capacitor's live-server mode (pointing at a deployed URL) over static
  // export, since that doesn't have this conflict and keeps middleware-based
  // auth working. See AUTHENTICATION_VALIDATION_REPORT.md.
};

export default nextConfig;
