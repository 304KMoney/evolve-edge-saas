export function buildWorkflowCallbackSuccessBody(input: {
  dispatchId: string;
  status: string;
  deduplicated?: boolean;
}) {
  return input.deduplicated
    ? {
        ok: true,
        dispatchId: input.dispatchId,
        status: input.status,
        deduplicated: true
      }
    : {
        ok: true,
        dispatchId: input.dispatchId,
        status: input.status
      };
}
