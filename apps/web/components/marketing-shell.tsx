import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Brand } from "./brand";

type MarketingShellProps = {
  children: ReactNode;
  ctaHref: string;
  ctaLabel: string;
};

const navItems = [
  { href: "/", label: "Home" },
  { href: "/pricing", label: "Pricing" },
  { href: "/intake", label: "Intake" },
  { href: "/contact", label: "Contact" },
  { href: "/sign-in", label: "Sign In" }
];

export function MarketingShell({
  children,
  ctaHref,
  ctaLabel
}: MarketingShellProps) {
  return (
    <div className="min-h-screen bg-[#f7f8fa] px-4 py-6 md:px-6 md:py-8">
      <div className="site-shell mx-auto max-w-[1480px]">
        <header className="relative z-10 border-b border-line px-6 py-6 md:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <Brand
              priority
              subtitle="AI risk and compliance advisory"
              imageClassName="w-[150px] sm:w-[178px]"
              labelClassName="text-steel"
            />
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-steel">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href as never}
                    className="rounded-full border border-transparent px-4 py-2 transition hover:border-line hover:bg-[#f5f7fb] hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <Link
                href={ctaHref as never}
                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#1cc7d8,#6fe8f1)] px-5 py-3 text-sm font-semibold text-[#05111d] shadow-[0_16px_40px_rgba(28,199,216,0.18)] transition hover:-translate-y-0.5"
              >
                {ctaLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </header>

        <div className="relative z-10 px-4 py-12 md:px-6 md:py-16">{children}</div>

        <footer className="relative z-10 border-t border-[#13233b] bg-[#081120] px-6 py-10 md:px-8">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <Brand
                imageClassName="w-[146px] sm:w-[170px]"
                subtitle="AI risk and compliance advisory"
              />
              <p className="mt-4 max-w-md text-sm leading-7 text-white/[0.64]">
                Evolve Edge helps leadership teams identify AI risk, align to compliance
                expectations, and leave with clear executive next steps.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/[0.55]">
                Product
              </p>
              <div className="mt-4 space-y-3 text-sm text-white/[0.72]">
                <Link href={"/pricing" as never} className="block transition hover:text-white">
                  Pricing
                </Link>
                <Link href={"/intake" as never} className="block transition hover:text-white">
                  Intake workflow
                </Link>
                <Link href={"/resources" as never} className="block transition hover:text-white">
                  Resources
                </Link>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/[0.55]">
                Company
              </p>
              <div className="mt-4 space-y-3 text-sm text-white/[0.72]">
                <Link href={"/contact" as never} className="block transition hover:text-white">
                  Contact
                </Link>
                <Link href={"/trust" as never} className="block transition hover:text-white">
                  Trust Center
                </Link>
                <Link href={"/methodology" as never} className="block transition hover:text-white">
                  Methodology
                </Link>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/[0.55]">
                Legal
              </p>
              <div className="mt-4 space-y-3 text-sm text-white/[0.72]">
                <Link href={"/terms" as never} className="block transition hover:text-white">
                  Terms of Service
                </Link>
                <Link href={"/privacy" as never} className="block transition hover:text-white">
                  Privacy Policy
                </Link>
                <Link href={"/dpa" as never} className="block transition hover:text-white">
                  DPA
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
