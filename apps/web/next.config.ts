import path from "node:path";
import type { NextConfig } from "next";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: path.join(__dirname, "../.."),
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

const sentryEnabled = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

function withOptionalSentryConfig(config: NextConfig) {
  if (!sentryEnabled) {
    return config;
  }

  try {
    const { withSentryConfig } = require("@sentry/nextjs") as {
      withSentryConfig: (
        nextConfig: NextConfig,
        sentryOptions: {
          silent: boolean;
          disableLogger: boolean;
        }
      ) => NextConfig;
    };

    return withSentryConfig(config, {
      silent: true,
      disableLogger: true
    });
  } catch {
    return config;
  }
}

export default withOptionalSentryConfig(nextConfig);
