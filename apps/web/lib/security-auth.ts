import { timingSafeEqual } from "node:crypto";

function toBuffer(value: string) {
  return Buffer.from(value, "utf8");
}

export function getBearerTokenFromRequest(request: Request) {
  const authorizationHeader = request.headers.get("authorization") ?? "";
  return authorizationHeader.startsWith("Bearer ")
    ? authorizationHeader.slice(7).trim()
    : "";
}

export function constantTimeEqual(value: string, expected: string) {
  const left = toBuffer(value);
  const right = toBuffer(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isAuthorizedBearerRequest(request: Request, expectedSecret: string) {
  const provided = getBearerTokenFromRequest(request);
  if (!provided || !expectedSecret) {
    return false;
  }

  return constantTimeEqual(provided, expectedSecret);
}
