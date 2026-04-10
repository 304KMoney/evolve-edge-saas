import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: ["@prisma/client", "prisma"],
  outputFileTracingIncludes: {
    "/**": [
      "../../node_modules/.prisma/client/**/*",
      "../../node_modules/@prisma/client/**/*"
    ]
  },
  transpilePackages: ["@evolve-edge/db", "@evolve-edge/ui"]
};

export default nextConfig;
