import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { AttributionCapture } from "../components/attribution-capture";
import {
  assertCriticalEnvironmentParity,
  logEnvironmentParityStatus,
  shouldEnforceCriticalEnvironmentParity
} from "../lib/env-validation";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://evolveedgeai.com");

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Evolve Edge — AI Risk & Compliance Readiness",
    template: "%s | Evolve Edge"
  },
  description:
    "Evolve Edge helps AI-using companies identify security, compliance, and governance gaps — and delivers audit-ready reports before customers, investors, or auditors force the conversation.",
  icons: {
    icon: "/brand/evolve-edge-logo.png",
    shortcut: "/brand/evolve-edge-logo.png",
    apple: "/brand/evolve-edge-logo.png"
  },
  openGraph: {
    title: "Evolve Edge — AI Risk & Compliance Readiness",
    description:
      "Evolve Edge helps AI-using companies identify security, compliance, and governance gaps — and delivers audit-ready reports before customers, investors, or auditors force the conversation.",
    url: appUrl,
    siteName: "Evolve Edge",
    images: [
      {
        url: "/brand/evolve-edge-logo.png",
        width: 800,
        alt: "Evolve Edge — AI Risk & Compliance Readiness"
      }
    ],
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Evolve Edge — AI Risk & Compliance Readiness",
    description:
      "AI risk assessment → audit-ready reports → customer & investor trust. Built for 20–200 person SaaS, AI, fintech, healthtech, and legaltech companies."
  },
  robots: {
    index: true,
    follow: true
  }
};

if (shouldEnforceCriticalEnvironmentParity()) {
  assertCriticalEnvironmentParity();
}

logEnvironmentParityStatus();

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  // nonce is read here for use with next/script components if present
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _nonce = requestHeaders.get("x-csp-nonce") ?? undefined;

  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <AttributionCapture />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
