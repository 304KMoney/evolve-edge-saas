"use server";

import {
  AUTH_SESSION_COOKIE,
  buildCookieSettings,
  createUserSession,
  isPasswordAuthEnabled,
  revokeSession,
  sanitizeInternalRedirect
} from "../../lib/auth";
import {
  createPasswordSignupAccount,
  getSignupSuccessRedirectPath,
  validateSignupInput
} from "../../lib/signup";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma, prisma } from "@evolve-edge/db";
import { getServerAuditRequestContext, writeAuditLog } from "../../lib/audit";
import {
  captureLeadSubmission,
  readLeadAttributionFromCookies
} from "../../lib/lead-pipeline";
import { publishDomainEvent } from "../../lib/domain-events";
import { trackProductAnalyticsEvent } from "../../lib/product-analytics";
import { consumeRateLimit } from "../../lib/security-rate-limit";
import { logServerEvent } from "../../lib/monitoring";

const SIGNUP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_RATE_LIMIT_MAX_REQUESTS = 5;

function redirectWithSignupError(error: string, redirectTo?: string): never {
  const params = new URLSearchParams({ error });
  if (redirectTo) {
    params.set("redirectTo", redirectTo);
  }

  redirect(`/signup?${params.toString()}` as never);
}

export async function signUpAction(formData: FormData) {
  const rawInput = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    companyName: String(formData.get("companyName") ?? "")
  };
  const redirectTo = sanitizeInternalRedirect(
    String(formData.get("redirectTo") ?? ""),
    ""
  );

  if (!isPasswordAuthEnabled()) {
    redirectWithSignupError("config", redirectTo);
  }

  const validation = validateSignupInput(rawInput);
  if (!validation.ok) {
    redirectWithSignupError(validation.error, redirectTo);
  }

  const rateLimit = await consumeRateLimit({
    storeKey: `auth:signup:${validation.data.email}`,
    maxRequests: SIGNUP_RATE_LIMIT_MAX_REQUESTS,
    windowMs: SIGNUP_RATE_LIMIT_WINDOW_MS,
    metadata: {
      routeKey: "signup",
      category: "auth",
      email: validation.data.email
    }
  });

  if (rateLimit.limited) {
    redirectWithSignupError("rate_limited", redirectTo);
  }

  const requestContext = await getServerAuditRequestContext();
  const result = await (async () => {
    try {
      return await createPasswordSignupAccount(validation.data);
    } catch (error) {
      logServerEvent("error", "signup.create_account.failed", {
        route: "signup.action",
        status: "failed",
        source: "signup",
        metadata: {
          message: error instanceof Error ? error.message : "Unknown error"
        }
      });

      return { ok: false as const, error: "unknown" as const };
    }
  })();

  if (!result.ok) {
    redirectWithSignupError(result.error, redirectTo);
  }

  await writeAuditLog(prisma, {
    userId: result.user.id,
    actorLabel: result.user.email,
    action: "auth.signup_succeeded",
    entityType: "user",
    entityId: result.user.id,
    metadata: {
      source: "self_serve_signup",
      companyNameProvided: Boolean(validation.data.companyName)
    },
    requestContext
  });

  try {
    await publishDomainEvent(prisma, {
      type: "user.created",
      aggregateType: "user",
      aggregateId: result.user.id,
      userId: result.user.id,
      idempotencyKey: `user.created:${result.user.id}`,
      payload: {
        userId: result.user.id,
        email: result.user.email,
        source: "self-serve-signup"
      } satisfies Prisma.InputJsonValue
    });
  } catch (error) {
    logServerEvent("warn", "signup.user_created_event.failed", {
      route: "signup.action",
      user_id: result.user.id,
      status: "failed",
      source: "signup",
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
  }

  try {
    const attribution = await readLeadAttributionFromCookies();
    const leadCapture = await captureLeadSubmission({
      source: "signup_entry",
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      companyName: validation.data.companyName,
      intent: "self-serve-signup",
      sourcePath: "/signup",
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
          intent: "self-serve-signup",
          requestedPlanCode: null,
          companyName: validation.data.companyName,
          deduped: false
        },
        source: "signup",
        path: "/signup",
        organizationId: null,
        userId: result.user.id,
        attribution
      });
    }
  } catch (error) {
    logServerEvent("warn", "signup.lead_projection.failed", {
      route: "signup.action",
      user_id: result.user.id,
      status: "failed",
      source: "signup",
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
  }

  const cookieStore = await cookies();
  await revokeSession(cookieStore.get(AUTH_SESSION_COOKIE)?.value);

  const token = await createUserSession(result.user.id);
  cookieStore.set(AUTH_SESSION_COOKIE, token, buildCookieSettings());

  const membershipCount = await prisma.organizationMember.count({
    where: { userId: result.user.id }
  });

  redirect(
    getSignupSuccessRedirectPath({
      membershipCount,
      redirectTo
    }) as never
  );
}
