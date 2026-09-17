import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@synesis/domain", "@synesis/ui"],
};

export default nextConfig;
