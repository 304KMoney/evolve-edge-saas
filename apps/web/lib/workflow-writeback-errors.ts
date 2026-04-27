import "server-only";

import { NextResponse } from "next/server";
import {
  buildWorkflowWritebackDuplicateBody,
  buildWorkflowWritebackErrorBody
} from "./workflow-writeback-response-contract";

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
  return NextResponse.json(
    buildWorkflowWritebackErrorBody({
      code: error.code,
      errorClass: error.errorClass,
      retryable: error.retryable,
      operatorVisible: error.operatorVisible,
      message: error.message
    }),
    { status: error.status }
  );
}

export function workflowWritebackDuplicateResponse(input: {
  dispatchId: string;
  correlationId: string;
  reportId: string;
  reportReference: string | null;
}) {
  return NextResponse.json(buildWorkflowWritebackDuplicateBody(input), { status: 200 });
}
