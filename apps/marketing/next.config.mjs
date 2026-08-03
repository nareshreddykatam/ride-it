/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ride-it/ui", "@ride-it/types", "@ride-it/api-client"],
  reactStrictMode: true,
  experimental: {},
};

export default nextConfig;
