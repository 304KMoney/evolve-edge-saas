import "server-only";

import { NextResponse } from "next/server";

export type WorkflowWritebackErrorClass =
  | "retryable"
  | "non_retryable_validation"
  | "operator_visible_failure";

export type WorkflowWritebackErrorCode =
  | "unauthorized_writeback"
  | "malformed_payload"
  | "unknown_writeback_target"
  | "persistence_failure";

export type WorkflowWritebackOutcomeCode = "duplicate_callback";

type WorkflowWritebackErrorDescriptor = {
  ok: false;
  error: {
    code: WorkflowWritebackErrorCode;
    class: WorkflowWritebackErrorClass;
    retryable: boolean;
    operatorVisible: boolean;
    message: string;
  };
};

type WorkflowWritebackIgnoredDescriptor = {
  ok: true;
  accepted: true;
  deduplicated: true;
  outcome: {
    code: WorkflowWritebackOutcomeCode;
    class: "ignore_safely";
    retryable: false;
    operatorVisible: false;
    message: string;
  };
};

export class WorkflowWritebackRouteError extends Error {
  constructor(
    readonly code: WorkflowWritebackErrorCode,
    readonly status: number,
    readonly errorClass: WorkflowWritebackErrorClass,
    readonly retryable: boolean,
    readonly operatorVisible: boolean,
    message: string
  ) {
    super(message);
    this.name = "WorkflowWritebackRouteError";
  }
}

export function unauthorizedWritebackError() {
  return new WorkflowWritebackRouteError(
    "unauthorized_writeback",
    401,
    "non_retryable_validation",
    false,
    false,
    "Unauthorized workflow writeback request."
  );
}

export function malformedWritebackPayloadError(message: string) {
  return new WorkflowWritebackRouteError(
    "malformed_payload",
    400,
    "non_retryable_validation",
    false,
    false,
    message
  );
}

export function unknownWritebackTargetError(message: string) {
  return new WorkflowWritebackRouteError(
    "unknown_writeback_target",
    404,
    "operator_visible_failure",
    false,
    true,
    message
  );
}

export function persistenceWritebackError(message: string) {
  return new WorkflowWritebackRouteError(
    "persistence_failure",
    500,
    "retryable",
    true,
    true,
    message
  );
}

export function toWorkflowWritebackErrorResponse(
  error: WorkflowWritebackRouteError
) {
  const body: WorkflowWritebackErrorDescriptor = {
    ok: false,
    error: {
      code: error.code,
      class: error.errorClass,
      retryable: error.retryable,
      operatorVisible: error.operatorVisible,
      message: error.message
    }
  };

  return NextResponse.json(body, { status: error.status });
}

export function workflowWritebackDuplicateResponse(input: {
  dispatchId: string;
  correlationId: string;
  reportId: string;
  reportReference: string | null;
}) {
  const body: WorkflowWritebackIgnoredDescriptor & {
    dispatchId: string;
    correlationId: string;
    reportId: string;
    reportReference: string | null;
  } = {
    ok: true,
    accepted: true,
    deduplicated: true,
    dispatchId: input.dispatchId,
    correlationId: input.correlationId,
    reportId: input.reportId,
    reportReference: input.reportReference,
    outcome: {
      code: "duplicate_callback",
      class: "ignore_safely",
      retryable: false,
      operatorVisible: false,
      message:
        "This workflow writeback milestone was already processed and was ignored safely."
    }
  };

  return NextResponse.json(body, { status: 200 });
}
