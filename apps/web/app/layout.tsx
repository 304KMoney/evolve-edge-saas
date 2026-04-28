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

export const metadata: Metadata = {
  title: "Evolve Edge",
  description: "AI governance and compliance SaaS platform",
  icons: {
    icon: "/brand/evolve-edge-logo.png",
    shortcut: "/brand/evolve-edge-logo.png",
    apple: "/brand/evolve-edge-logo.png"
  },
  openGraph: {
    title: "Evolve Edge",
    description: "AI governance and compliance SaaS platform",
    images: ["/brand/evolve-edge-logo.png"]
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
