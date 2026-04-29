import { PageAnalyticsTracker } from "../../components/page-analytics-tracker";
import {
  getOptionalCurrentSession,
  sanitizeInternalRedirect
} from "../../lib/auth";
import { getSignupErrorMessage } from "../../lib/signup";
import { redirect } from "next/navigation";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<{
    error?: string;
    name?: string;
    email?: string;
    companyName?: string;
    redirectTo?: string;
  }>;
}) {
  const params = await searchParams;
  const existingSession = await getOptionalCurrentSession();
  const redirectTo = sanitizeInternalRedirect(params.redirectTo, "");

  if (existingSession) {
    redirect((redirectTo || (existingSession.onboardingRequired ? "/onboarding" : "/dashboard")) as never);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <PageAnalyticsTracker
        eventName="signup.started"
        payload={{
          source: redirectTo ? "redirected-entry" : "direct-signup",
          intent: null,
          requestedPlanCode: null
        }}
        source="signup-page"
        storageKey={`analytics:signup-started:${redirectTo || "direct"}`}
      />
      <SignupForm
        errorMessage={getSignupErrorMessage(params.error)}
        defaultName={params.name ?? ""}
        defaultEmail={params.email ?? ""}
        defaultCompanyName={params.companyName ?? ""}
        redirectTo={redirectTo}
      />
    </main>
  );
}
