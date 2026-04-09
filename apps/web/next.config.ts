import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true
  },
  transpilePackages: ["@evolve-edge/db", "@evolve-edge/ui"]
};

export default nextConfig;
