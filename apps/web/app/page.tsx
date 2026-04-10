import { isPasswordAuthEnabled } from "../lib/auth";
import Link from "next/link";

export default function HomePage() {
  const primaryHref = isPasswordAuthEnabled() ? "/sign-in" : "/dashboard";
  const primaryLabel = isPasswordAuthEnabled() ? "Sign In" : "Open Dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-3xl rounded-[28px] border border-white/70 bg-white/80 p-10 shadow-panel backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
          Evolve Edge
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">
          AI governance and compliance, delivered as a real SaaS platform.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-steel">
          This scaffold includes the recommended repo structure, a multi-tenant
          database schema, and the first clickable dashboard UI for the MVP.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={primaryHref}
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
          >
            {primaryLabel}
          </Link>
          <Link
            href={primaryHref}
            className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
          >
            View Workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
