import { createHmac, timingSafeEqual } from "node:crypto";

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export function verifyStripeWebhookSignature(input: {
  payload: string;
  signatureHeader: string;
  webhookSecret: string;
  toleranceSeconds?: number;
}) {
  const parts = input.signatureHeader.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    throw new Error("Invalid Stripe signature header.");
  }

  const parsedTimestamp = Number(timestamp);
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const toleranceSeconds =
    input.toleranceSeconds ?? STRIPE_SIGNATURE_TOLERANCE_SECONDS;

  if (
    !Number.isFinite(parsedTimestamp) ||
    Math.abs(currentTimestamp - parsedTimestamp) > toleranceSeconds
  ) {
    throw new Error("Stripe webhook signature timestamp is outside the allowed tolerance.");
  }

  const signedPayload = `${timestamp}.${input.payload}`;
  const expectedSignature = createHmac("sha256", input.webhookSecret)
    .update(signedPayload)
    .digest("hex");
  const expected = Buffer.from(expectedSignature, "utf8");

  const isValid = signatures.some((signature) => {
    const provided = Buffer.from(signature, "utf8");
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  });

  if (!isValid) {
    throw new Error("Invalid Stripe webhook signature.");
  }

  try {
    return JSON.parse(input.payload) as unknown;
  } catch {
    throw new Error("Stripe webhook payload is not valid JSON.");
  }
}


export function verifySvixWebhookSignature(input: {
  payload: string;
  webhookSecret: string;
  messageId: string;
  timestamp: string;
  signatureHeader: string;
  toleranceSeconds?: number;
}) {
  const parsedTimestamp = Number(input.timestamp);
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const toleranceSeconds = input.toleranceSeconds ?? 300;

  if (
    !Number.isFinite(parsedTimestamp) ||
    Math.abs(currentTimestamp - parsedTimestamp) > toleranceSeconds
  ) {
    throw new Error("Webhook signature timestamp is outside the allowed tolerance.");
  }

  const normalizedSecret = input.webhookSecret.startsWith("whsec_")
    ? input.webhookSecret.slice("whsec_".length)
    : input.webhookSecret;
  const key = Buffer.from(normalizedSecret, "base64");
  const signedPayload = `${input.messageId}.${input.timestamp}.${input.payload}`;
  const expectedSignature = createHmac("sha256", key).update(signedPayload).digest("base64");

  const signatures = input.signatureHeader
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const marker = "v1,";
      const index = part.indexOf(marker);
      return index >= 0 ? part.slice(index + marker.length) : null;
    })
    .filter((value): value is string => Boolean(value));

  if (signatures.length === 0) {
    throw new Error("Missing webhook signature version v1.");
  }

  const expected = Buffer.from(expectedSignature, "utf8");
  const isValid = signatures.some((signature) => {
    const provided = Buffer.from(signature, "utf8");
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  });

  if (!isValid) {
    throw new Error("Invalid webhook signature.");
  }
}
