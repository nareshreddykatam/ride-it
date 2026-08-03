/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ride-it/ui", "@ride-it/types", "@ride-it/api-client"],
  reactStrictMode: true,
  output: "export", // static export — required for Capacitor's native shell to load the bundle
  images: { unoptimized: true },
};

export default nextConfig;
