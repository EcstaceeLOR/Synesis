import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@synesis/domain", "@synesis/ui"],
};

export default nextConfig;
