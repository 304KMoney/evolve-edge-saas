import Link from "next/link";
import type { Route } from "next";
import React from "react";
import { signUpAction } from "./actions";

export type SignupFormProps = {
  errorMessage?: string | null;
  defaultName?: string;
  defaultEmail?: string;
  defaultCompanyName?: string;
  redirectTo?: string;
};

export function SignupForm({
  errorMessage,
  defaultName = "",
  defaultEmail = "",
  defaultCompanyName = "",
  redirectTo = ""
}: SignupFormProps) {
  const signInHref = redirectTo
    ? `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`
    : "/sign-in";

  return (
    <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel backdrop-blur">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
        Evolve Edge
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">
        Create your account
      </h1>
      <p className="mt-3 text-sm leading-7 text-steel">
        Start a secure workspace for AI governance, audit readiness, and
        executive reporting. You will finish workspace setup after signup.
      </p>

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}

      <form action={signUpAction} className="mt-6 space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <label className="block">
          <span className="text-sm font-medium text-ink">Name</span>
          <input
            name="name"
            type="text"
            autoComplete="name"
            defaultValue={defaultName}
            className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Work email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={defaultEmail}
            className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Company name</span>
          <input
            name="companyName"
            type="text"
            autoComplete="organization"
            defaultValue={defaultCompanyName}
            className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            required
          />
          <span className="mt-2 block text-xs leading-5 text-steel">
            Use at least 10 characters. Never reuse a password from another service.
          </span>
        </label>

        <button
          type="submit"
          className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
        >
          Create Account
        </button>
      </form>

      <div className="mt-6 flex items-center justify-between gap-4 text-sm text-steel">
        <Link href={signInHref as Route} className="font-semibold text-accent">
          Already have an account? Sign in
        </Link>
        <Link href={"/" as Route} className="font-semibold text-accent">
          Back home
        </Link>
      </div>
    </div>
  );
}
