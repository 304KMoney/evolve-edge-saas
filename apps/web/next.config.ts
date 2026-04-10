import type { NextConfig } from "next";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: ["@prisma/client", "prisma"],
  outputFileTracingIncludes: {
    "/**": [
      "../../node_modules/.prisma/client/**/*",
      "../../node_modules/@prisma/client/**/*"
    ]
  },
  transpilePackages: ["@evolve-edge/db", "@evolve-edge/ui"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = config.plugins ?? [];
      config.plugins.push(new PrismaPlugin());
    }

    return config;
  }
};

export default nextConfig;
