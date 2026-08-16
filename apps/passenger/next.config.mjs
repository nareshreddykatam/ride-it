/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ride-it/ui", "@ride-it/types", "@ride-it/api-client"],
  reactStrictMode: true,
  experimental: {
    // Passenger app targets PWA — manifest/service worker added in a later pass
  },
};

export default nextConfig;
