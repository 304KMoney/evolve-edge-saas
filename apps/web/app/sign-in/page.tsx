import {
  getPasswordAuthConfig,
  getSignInErrorMessage,
  isPasswordAuthEnabled
} from "../../lib/auth";
import { PageAnalyticsTracker } from "../../components/page-analytics-tracker";
import { signInAction } from "./actions";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  if (!isPasswordAuthEnabled()) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const errorMessage = getSignInErrorMessage(params.error);
  const { email, isComplete } = getPasswordAuthConfig();
  const redirectTo =
    typeof params.redirectTo === "string" && params.redirectTo.startsWith("/")
      ? params.redirectTo
      : "";

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel backdrop-blur">
        <PageAnalyticsTracker
          eventName="signup.started"
          payload={{
            source: redirectTo.includes("leadSource=")
              ? "pricing_plan_selection"
              : redirectTo
                ? "redirected-entry"
                : "direct-signin",
            intent: redirectTo.includes("leadIntent=")
              ? new URL(redirectTo, "http://localhost").searchParams.get("leadIntent")
              : null,
            requestedPlanCode: redirectTo.includes("leadPlanCode=")
              ? new URL(redirectTo, "http://localhost").searchParams.get("leadPlanCode")
              : null
          }}
          source="sign-in-page"
          storageKey={`analytics:signup-started:${redirectTo || "direct"}`}
        />
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
          Evolve Edge
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">
          Sign in to your workspace
        </h1>
        <p className="mt-3 text-sm leading-7 text-steel">
          Use your workspace credentials to access the live governance,
          compliance, assessment, and reporting workflows.
        </p>

        {!isComplete ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
            Password auth is enabled, but the bootstrap credential environment
            variables are not fully configured yet.
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        <form action={signInAction} className="mt-6 space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label className="block">
            <span className="text-sm font-medium text-ink">Email</span>
            <input
              name="email"
              type="email"
              defaultValue={email}
              autoComplete="email"
              className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ink">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              required
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
          >
            Sign In
          </button>
        </form>

        <div className="mt-6 text-sm text-steel">
          <Link href="/" className="font-semibold text-accent">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
