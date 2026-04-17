import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AttributionCapture } from "../components/attribution-capture";
import { assertCriticalEnvironmentParity, logEnvironmentParityStatus } from "../lib/env-validation";

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

assertCriticalEnvironmentParity();
logEnvironmentParityStatus();

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
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
