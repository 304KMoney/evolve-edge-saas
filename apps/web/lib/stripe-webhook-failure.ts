export function shouldEmitStripeWebhookFailureArtifacts(input: {
  transitioned: boolean;
  billingEventId?: string | null;
  organizationId?: string | null;
}) {
  return (
    input.transitioned &&
    Boolean(input.billingEventId) &&
    Boolean(input.organizationId)
  );
}
