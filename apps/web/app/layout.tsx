import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evolve Edge",
  description: "AI governance and compliance SaaS platform"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

