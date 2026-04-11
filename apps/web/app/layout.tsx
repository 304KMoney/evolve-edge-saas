import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AttributionCapture } from "../components/attribution-capture";
import { DemoModeBanner } from "../components/demo-mode-banner";
import { getDemoModeConfig } from "../lib/demo-mode";

export const metadata: Metadata = {
  title: "Evolve Edge",
  description: "AI governance and compliance SaaS platform"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const demoMode = getDemoModeConfig();

  return (
    <html lang="en">
      <body>
        {demoMode.enabled ? (
          <DemoModeBanner
            label={demoMode.label}
            resetCommand={demoMode.resetCommand}
          />
        ) : null}
        <Suspense fallback={null}>
          <AttributionCapture />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
