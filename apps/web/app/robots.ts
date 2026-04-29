import type { MetadataRoute } from "next";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://evolveedge.ai");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/dashboard/",
          "/admin",
          "/admin/",
          "/onboarding",
          "/onboarding/",
          "/billing",
          "/billing/",
          "/reports/",
          "/briefings/",
          "/api/",
          "/sign-out"
        ]
      }
    ],
    sitemap: `${appUrl}/sitemap.xml`
  };
}
