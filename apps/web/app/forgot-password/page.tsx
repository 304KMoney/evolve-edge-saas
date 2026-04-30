import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "../../components/marketing-shell";
import { requestPasswordResetAction } from "./actions";

export const metadata: Metadata = {
  title: "Forgot Password | Evolve Edge",
  description: "Reset your Evolve Edge password."
};

export default function ForgotPasswordPage() {
  return (
    <MarketingShell ctaHref="/sign-in" ctaLabel="Sign In">
      <div className="mx-auto max-w-md py-12">
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel backdrop-blur">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Forgot your password?
          </h1>
          <p className="mt-3 text-sm leading-7 text-steel">
            Enter the email address you use to sign in and we&apos;ll send you a link to reset your
            password.
          </p>

          <form action={requestPasswordResetAction} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink">Email address</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                placeholder="you@example.com"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Send reset link
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-line bg-[#f7f9fc] px-4 py-3 text-sm text-steel">
            If that email is registered, a password reset link has been sent.
          </div>

          <div className="mt-6 text-sm text-steel">
            <Link href="/sign-in" className="font-semibold text-accent transition hover:opacity-80">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
