import { NextResponse } from "next/server";
import { getAppUrl } from "./runtime-config";
import { isTrustedOriginRequest } from "./http-security";

export function enforceTrustedOrigin(request: Request) {
  const trusted = isTrustedOriginRequest({
    requestUrl: request.url,
    originHeader: request.headers.get("origin"),
    refererHeader: request.headers.get("referer"),
    allowedOrigins: [getAppUrl()]
  });

  if (trusted) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Origin is not authorized for this request."
    },
    { status: 403 }
  );
}
