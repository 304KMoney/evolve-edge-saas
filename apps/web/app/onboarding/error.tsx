"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function OnboardingError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[onboarding] render error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-lg rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-panel backdrop-blur md:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
          Evolve Edge
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">
          Something went wrong
        </h1>
        <p className="mt-4 text-sm leading-7 text-steel">
          We ran into an unexpected error while loading the onboarding workspace.
          This has been logged. Please try again — if the issue continues,{" "}
          <a href="mailto:k.green@evolveedgeai.com" className="text-accent">
            contact us
          </a>
          .
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-steel">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#1cc7d8,#6fe8f1)] px-6 py-3 text-sm font-semibold text-[#05111d] shadow-[0_8px_24px_rgba(28,199,216,0.22)] transition hover:-translate-y-0.5"
          >
            Try again
          </button>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full border border-line px-6 py-3 text-sm font-semibold text-ink transition hover:border-accent/30"
          >
            Return to pricing
          </Link>
        </div>
      </div>
    </main>
  );
}
