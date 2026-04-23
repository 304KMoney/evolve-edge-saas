export function resolveWorkflowWritebackCustomerRunReconciliation(input: {
  reportStatus?: "received" | "processing" | "awaiting_review" | "ready" | "delivered" | "failed" | null;
  deliveryStatus?:
    | "generated"
    | "reviewed"
    | "sent"
    | "briefing_booked"
    | "briefing_completed"
    | "failed"
    | null;
}) {
  const reportGenerationFailed = input.reportStatus === "failed";
  const reportGenerated =
    input.reportStatus === "ready" ||
    input.reportStatus === "delivered" ||
    input.deliveryStatus === "generated" ||
    input.deliveryStatus === "reviewed" ||
    input.deliveryStatus === "sent" ||
    input.deliveryStatus === "briefing_booked" ||
    input.deliveryStatus === "briefing_completed";
  const deliveryCompleted =
    input.reportStatus === "delivered" ||
    input.deliveryStatus === "sent" ||
    input.deliveryStatus === "briefing_booked" ||
    input.deliveryStatus === "briefing_completed";

  return {
    reportGenerationFailed,
    reportGenerated,
    deliveryCompleted
  };
}
