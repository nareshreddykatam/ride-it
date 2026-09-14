/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ride-it/ui", "@ride-it/types"],
  reactStrictMode: true,
  experimental: {},
};

export default nextConfig;
