import { NextResponse } from "next/server";
import { getOptionalEnv, getRuntimeEnvironment } from "../../../../lib/runtime-config";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";
import { isAuthorizedBearerRequest } from "../../../../lib/security-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disabledResponse() {
  return NextResponse.json(
    {
      error:
        "Direct intake-to-n8n dispatch is disabled. Complete app-owned onboarding intake and use backend workflow dispatch."
    },
    { status: 410 }
  );
}

export async function POST(request: Request) {
  const rateLimited = await applyRouteRateLimit(request, {
    key: "automation-intake-to-n8n",
    category: "api"
  });
  if (rateLimited) {
    return rateLimited;
  }

  const intakeSecret =
    getOptionalEnv("PUBLIC_INTAKE_SHARED_SECRET") ??
    getOptionalEnv("OUTBOUND_DISPATCH_SECRET");
  if (!intakeSecret && getRuntimeEnvironment() === "production") {
    return NextResponse.json(
      { error: "Public intake is not configured for production." },
      { status: 503 }
    );
  }

  if (intakeSecret && !isAuthorizedBearerRequest(request, intakeSecret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return disabledResponse();
}

export async function GET() {
  return disabledResponse();
}
