import type { MetadataRoute } from "next";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://evolveedge.ai");

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const marketingPages = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" as const },
    { path: "/pricing", priority: 0.95, changeFrequency: "weekly" as const },
    { path: "/contact-sales", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/trust", priority: 0.85, changeFrequency: "monthly" as const },
    { path: "/methodology", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/frameworks", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/security", priority: 0.75, changeFrequency: "monthly" as const },
    { path: "/resources", priority: 0.75, changeFrequency: "monthly" as const },
    { path: "/intake", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/terms", priority: 0.5, changeFrequency: "yearly" as const },
    { path: "/privacy", priority: 0.5, changeFrequency: "yearly" as const },
    { path: "/dpa", priority: 0.5, changeFrequency: "yearly" as const }
  ];

  return marketingPages.map(({ path, priority, changeFrequency }) => ({
    url: `${appUrl}${path}`,
    lastModified: now,
    changeFrequency,
    priority
  }));
}
