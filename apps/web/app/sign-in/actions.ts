"use server";

import {
  AUTH_SESSION_COOKIE,
  authenticateUser,
  buildCookieSettings,
  createUserSession,
  isPasswordAuthEnabled,
  revokeSession,
  sanitizeInternalRedirect
} from "../../lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@evolve-edge/db";
import { getServerAuditRequestContext, writeAuditLog } from "../../lib/audit";
import {
  captureLeadSubmission,
  readLeadAttributionFromCookies
} from "../../lib/lead-pipeline";
import { trackProductAnalyticsEvent } from "../../lib/product-analytics";

function readLeadEntryFromRedirect(redirectTo: string) {
  if (!redirectTo) {
    return {
      source: null,
      intent: null,
      requestedPlanCode: null
    };
  }

  try {
    const url = new URL(redirectTo, "http://localhost");
    return {
      source: url.searchParams.get("leadSource"),
      intent: url.searchParams.get("leadIntent"),
      requestedPlanCode:
        url.searchParams.get("leadPlanCode") ?? url.searchParams.get("plan")
    };
  } catch {
    return {
      source: null,
      intent: null,
      requestedPlanCode: null
    };
  }
}

export async function signInAction(formData: FormData) {
  if (!isPasswordAuthEnabled()) {
    redirect("/sign-in?error=config");
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const redirectTo = sanitizeInternalRedirect(
    String(formData.get("redirectTo") ?? ""),
    ""
  );
  const requestContext = await getServerAuditRequestContext();
  const result = await authenticateUser(email, password);

  if (!result.user) {
    await writeAuditLog(prisma, {
      actorLabel: email.trim().toLowerCase(),
      action: "auth.sign_in_failed",
      entityType: "user",
      entityId: email.trim().toLowerCase() || "unknown",
      metadata: {
        email: email.trim().toLowerCase(),
        error: result.error ?? "invalid"
      },
      requestContext
    });
    redirect(`/sign-in?error=${result.error ?? "invalid"}`);
  }

  const cookieStore = await cookies();
  await revokeSession(cookieStore.get(AUTH_SESSION_COOKIE)?.value);

  const token = await createUserSession(result.user.id);
  cookieStore.set(
    AUTH_SESSION_COOKIE,
    token,
    buildCookieSettings()
  );

  const membershipCount = await prisma.organizationMember.count({
    where: { userId: result.user.id }
  });

  const primaryMembership = await prisma.organizationMember.findFirst({
    where: { userId: result.user.id },
    select: { organizationId: true },
    orderBy: { createdAt: "asc" }
  });
  const leadEntry = readLeadEntryFromRedirect(redirectTo);

  if (membershipCount === 0) {
    const attribution = await readLeadAttributionFromCookies();
    const leadCapture = await captureLeadSubmission({
      source: "signup_entry",
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      intent: leadEntry.intent,
      requestedPlanCode: leadEntry.requestedPlanCode,
      sourcePath: redirectTo || "/sign-in",
      pricingContext: leadEntry.source,
      userId: result.user.id,
      attribution,
      actorLabel: result.user.email,
      requestContext
    });

    if (!leadCapture.deduped) {
      await trackProductAnalyticsEvent({
        name: "funnel.lead_captured",
        payload: {
          source: "signup_entry",
          intent: leadEntry.intent,
          requestedPlanCode: leadEntry.requestedPlanCode,
          companyName: null,
          deduped: false
        },
        source: "sign-in",
        path: redirectTo || "/sign-in",
        organizationId: null,
        userId: result.user.id,
        attribution
      });
    }
  }

  await writeAuditLog(prisma, {
    organizationId: primaryMembership?.organizationId ?? null,
    userId: result.user.id,
    actorLabel: result.user.email,
    action: "auth.sign_in_succeeded",
    entityType: "session",
    entityId: result.user.id,
    metadata: {
      membershipCount
    },
    requestContext
  });

  redirect(
    (redirectTo || (membershipCount > 0 ? "/dashboard" : "/onboarding")) as never
  );
}
