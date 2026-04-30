import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildSecurityHeaders } from "./lib/http-security";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestHeaders = new Headers(request.headers);

  if (!requestHeaders.get("x-request-id")) {
    requestHeaders.set("x-request-id", crypto.randomUUID());
  }
  requestHeaders.set(
    "x-request-path",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  requestHeaders.set("x-csp-nonce", nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  const securityHeaders = buildSecurityHeaders({
    pathname: request.nextUrl.pathname,
    isDevelopment: process.env.NODE_ENV !== "production",
    isPreview:
      process.env.VERCEL_ENV === "preview" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview",
    nonce
  });

  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }

  response.headers.set("x-request-id", requestHeaders.get("x-request-id")!);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
