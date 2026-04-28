import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MarketingShell } from "../../components/marketing-shell";
import { resetPasswordAction } from "./actions";

export const metadata: Metadata = {
  title: "Reset Password | Evolve Edge",
  description: "Set a new password for your Evolve Edge account."
};

export const dynamic = "force-dynamic";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string;
    error?: string;
  }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token.trim() : "";
  const error = typeof params.error === "string" ? params.error : null;

  if (!token) {
    redirect("/forgot-password");
  }

  const isInvalidToken = error === "invalid_token";
  const isInvalidPassword = error === "invalid_password";

  return (
    <MarketingShell ctaHref="/sign-in" ctaLabel="Sign In">
      <div className="mx-auto max-w-md py-12">
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel backdrop-blur">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Choose a new password</h1>
          <p className="mt-3 text-sm leading-7 text-steel">
            Enter a new password for your Evolve Edge account. Passwords must be at least 8
            characters.
          </p>

          {isInvalidToken ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
              This reset link is invalid or has expired.{" "}
              <Link href="/forgot-password" className="font-semibold underline">
                Request a new one
              </Link>
              .
            </div>
          ) : null}

          {isInvalidPassword ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
              Passwords must be at least 8 characters and must match.
            </div>
          ) : null}

          {!isInvalidToken ? (
            <form action={resetPasswordAction} className="mt-6 space-y-4">
              <input type="hidden" name="token" value={token} />

              <label className="block">
                <span className="text-sm font-medium text-ink">New password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink">Confirm new password</span>
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                />
              </label>

              <button
                type="submit"
                className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Set new password
              </button>
            </form>
          ) : null}

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
