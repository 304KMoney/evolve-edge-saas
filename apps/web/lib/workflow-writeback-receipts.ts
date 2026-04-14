import "server-only";

import { Prisma, prisma } from "@evolve-edge/db";
import { randomUUID } from "node:crypto";

type WorkflowWritebackReceiptDbClient = Prisma.TransactionClient | typeof prisma;

export function buildWorkflowWritebackStatusMarker(input: {
  reportStatus?: string | null;
  deliveryStatus?: string | null;
  operatorEventCode?: string | null;
  hasArtifactUpdate?: boolean;
}) {
  const markers: string[] = [];

  if (input.reportStatus) {
    markers.push(`report:${input.reportStatus}`);
  }

  if (input.deliveryStatus) {
    markers.push(`delivery:${input.deliveryStatus}`);
  }

  if (input.operatorEventCode) {
    markers.push(`operator:${input.operatorEventCode}`);
  }

  if (input.hasArtifactUpdate) {
    markers.push("artifact");
  }

  return markers.length > 0 ? markers.join("|") : "patch";
}

export function buildWorkflowWritebackDedupeKey(input: {
  correlationId: string;
  reportId: string;
  statusMarker: string;
}) {
  return `writeback:${input.correlationId}:${input.reportId}:${input.statusMarker}`;
}

export async function claimWorkflowWritebackReceipt(input: {
  db?: WorkflowWritebackReceiptDbClient;
  correlationId: string;
  dispatchId: string;
  reportId: string;
  statusMarker: string;
}) {
  const db = input.db ?? prisma;
  const dedupeKey = buildWorkflowWritebackDedupeKey({
    correlationId: input.correlationId,
    reportId: input.reportId,
    statusMarker: input.statusMarker
  });

  const result = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "WorkflowWritebackReceipt" (
      "id",
      "dedupeKey",
      "correlationId",
      "dispatchId",
      "reportId",
      "statusMarker"
    )
    VALUES (
      ${randomUUID()},
      ${dedupeKey},
      ${input.correlationId},
      ${input.dispatchId},
      ${input.reportId},
      ${input.statusMarker}
    )
    ON CONFLICT ("dedupeKey") DO NOTHING
    RETURNING "id"
  `);

  return {
    claimed: result.length > 0,
    dedupeKey
  };
}
