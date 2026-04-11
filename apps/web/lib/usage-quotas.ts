import {
  Prisma,
  prisma
} from "@evolve-edge/db";
import { redirect } from "next/navigation";
import { getOrganizationEntitlements, type EntitlementSnapshot } from "./entitlements";
import { getOrganizationSubscriptionSnapshot } from "./subscription-domain";

type UsageMeterKeyValue =
  | "AUDITS"
  | "EVIDENCE_UPLOADS"
  | "DOCUMENTS_PROCESSED";

type UsageQuotaDbClient =
  | typeof prisma
  | (Prisma.TransactionClient & {
      usageMeter: typeof prisma.usageMeter;
      usageEvent: typeof prisma.usageEvent;
      subscription: typeof prisma.subscription;
    });

export const USAGE_QUOTA_KEYS = [
  "audits",
  "evidence_uploads",
  "documents_processed"
] as const;

export type UsageQuotaKey = (typeof USAGE_QUOTA_KEYS)[number];

export type UsagePeriodWindow = {
  periodStart: Date;
  periodEnd: Date;
};

export type UsageRemainingSnapshot = {
  organizationId: string;
  meterKey: UsageQuotaKey;
  meterKeyValue: UsageMeterKeyValue;
  limit: number | null;
  used: number;
  remaining: number | null;
  percentUsed: number | null;
  periodStart: Date;
  periodEnd: Date;
  isUnlimited: boolean;
};

export type RecordUsageEventInput = {
  organizationId: string;
  meterKey: UsageQuotaKey;
  quantity?: number;
  idempotencyKey: string;
  source: string;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  occurredAt?: Date;
};

export type RecordUsageEventResult = {
  recorded: boolean;
  snapshot: UsageRemainingSnapshot;
};

const USAGE_QUOTA_KEY_MAP: Record<UsageQuotaKey, UsageMeterKeyValue> = {
  audits: "AUDITS",
  evidence_uploads: "EVIDENCE_UPLOADS",
  documents_processed: "DOCUMENTS_PROCESSED"
};

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public readonly organizationId: string,
    public readonly meterKey: UsageQuotaKey,
    public readonly snapshot: UsageRemainingSnapshot
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

function runUsageTransaction<T>(
  db: UsageQuotaDbClient,
  handler: (tx: Prisma.TransactionClient) => Promise<T>
) {
  if ("$transaction" in db) {
    return db.$transaction(handler);
  }

  return handler(db);
}

function appendErrorToRedirectPath(path: string, message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}error=${encodeURIComponent(message)}`;
}

function coerceQuantity(quantity: number | undefined) {
  const normalized = quantity ?? 1;

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error("Usage event quantity must be a positive integer.");
  }

  return normalized;
}

export function getUsageMeterKeyValue(meterKey: UsageQuotaKey) {
  return USAGE_QUOTA_KEY_MAP[meterKey];
}

export function getUsagePeriodWindow(now: Date = new Date()): UsagePeriodWindow {
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  );

  return {
    periodStart,
    periodEnd
  };
}

export function resolveQuotaLimit(
  entitlements: Pick<EntitlementSnapshot, "limits">,
  meterKey: UsageQuotaKey
) {
  switch (meterKey) {
    case "audits":
      return entitlements.limits.audits;
    case "evidence_uploads":
      return entitlements.limits.uploads;
    case "documents_processed":
      return entitlements.limits.ai_processing_runs;
    default:
      return null;
  }
}

export function buildUsageRemainingSnapshot(input: {
  organizationId: string;
  meterKey: UsageQuotaKey;
  limit: number | null;
  used: number;
  periodStart: Date;
  periodEnd: Date;
}): UsageRemainingSnapshot {
  const remaining =
    input.limit === null ? null : Math.max(input.limit - input.used, 0);
  const percentUsed =
    input.limit && input.limit > 0
      ? Math.min(999, Math.round((input.used / input.limit) * 100))
      : null;

  return {
    organizationId: input.organizationId,
    meterKey: input.meterKey,
    meterKeyValue: getUsageMeterKeyValue(input.meterKey),
    limit: input.limit,
    used: input.used,
    remaining,
    percentUsed,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    isUnlimited: input.limit === null
  };
}

export function getQuotaExceededMessage(meterKey: UsageQuotaKey) {
  switch (meterKey) {
    case "audits":
      return "Monthly audit quota reached. Upgrade required to create another assessment.";
    case "evidence_uploads":
      return "Monthly evidence upload quota reached. Upgrade required to add more evidence this month.";
    case "documents_processed":
      return "Monthly document processing quota reached. Upgrade required to process more evidence this month.";
    default:
      return "Usage quota reached. Upgrade required.";
  }
}

export function isQuotaExceeded(
  snapshot: Pick<UsageRemainingSnapshot, "limit" | "used">,
  quantity = 1
) {
  const normalizedQuantity = coerceQuantity(quantity);

  return (
    snapshot.limit !== null && snapshot.used + normalizedQuantity > snapshot.limit
  );
}

async function getUsageLimitContext(
  organizationId: string,
  meterKey: UsageQuotaKey,
  db: UsageQuotaDbClient
) {
  const [entitlements, subscriptionSnapshot] = await Promise.all([
    getOrganizationEntitlements(organizationId, db),
    getOrganizationSubscriptionSnapshot(organizationId, db)
  ]);

  return {
    limit: resolveQuotaLimit(entitlements, meterKey),
    subscriptionId: subscriptionSnapshot.subscription?.id ?? null
  };
}

export async function getUsageRemaining(
  organizationId: string,
  meterKey: UsageQuotaKey,
  options?: {
    db?: UsageQuotaDbClient;
    now?: Date;
  }
) {
  const db = options?.db ?? prisma;
  const window = getUsagePeriodWindow(options?.now);
  const meterKeyValue = getUsageMeterKeyValue(meterKey);
  const [{ limit }, meter] = await Promise.all([
    getUsageLimitContext(organizationId, meterKey, db),
    db.usageMeter.findUnique({
      where: {
        organizationId_meterKey_periodStart: {
          organizationId,
          meterKey: meterKeyValue,
          periodStart: window.periodStart
        }
      }
    })
  ]);

  return buildUsageRemainingSnapshot({
    organizationId,
    meterKey,
    limit,
    used: meter?.usedQuantity ?? 0,
    periodStart: window.periodStart,
    periodEnd: window.periodEnd
  });
}

export async function requireQuota(
  organizationId: string,
  meterKey: UsageQuotaKey,
  options?: {
    db?: UsageQuotaDbClient;
    quantity?: number;
    now?: Date;
    failureRedirect?: string | null;
    failureMessage?: string;
  }
) {
  const snapshot = await getUsageRemaining(organizationId, meterKey, {
    db: options?.db ?? prisma,
    now: options?.now
  });
  const quantity = options?.quantity ?? 1;

  if (isQuotaExceeded(snapshot, quantity)) {
    const message = options?.failureMessage ?? getQuotaExceededMessage(meterKey);

    if (options?.failureRedirect) {
      redirect(appendErrorToRedirectPath(options.failureRedirect, message) as never);
    }

    throw new QuotaExceededError(message, organizationId, meterKey, snapshot);
  }

  return snapshot;
}

async function incrementUsageMeter(input: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  subscriptionId: string | null;
  meterKey: UsageQuotaKey;
  quantity: number;
  limit: number | null;
  window: UsagePeriodWindow;
  occurredAt: Date;
}) {
  const meterKeyValue = getUsageMeterKeyValue(input.meterKey);
  const existing = await input.tx.usageMeter.findUnique({
    where: {
      organizationId_meterKey_periodStart: {
        organizationId: input.organizationId,
        meterKey: meterKeyValue,
        periodStart: input.window.periodStart
      }
    }
  });

  if (!existing) {
    try {
      return await input.tx.usageMeter.create({
        data: {
          organizationId: input.organizationId,
          subscriptionId: input.subscriptionId,
          meterKey: meterKeyValue,
          periodStart: input.window.periodStart,
          periodEnd: input.window.periodEnd,
          usedQuantity: input.quantity,
          limitQuantity: input.limit,
          lastEventAt: input.occurredAt
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return incrementUsageMeter({
          ...input,
          tx: input.tx
        });
      }

      throw error;
    }
  }

  if (input.limit !== null) {
    const updatedRows = await input.tx.usageMeter.updateMany({
      where: {
        id: existing.id,
        usedQuantity: {
          lte: input.limit - input.quantity
        }
      },
      data: {
        usedQuantity: {
          increment: input.quantity
        },
        limitQuantity: input.limit,
        lastEventAt: input.occurredAt
      }
    });

    if (updatedRows.count === 0) {
      const snapshot = buildUsageRemainingSnapshot({
        organizationId: input.organizationId,
        meterKey: input.meterKey,
        limit: input.limit,
        used: existing.usedQuantity,
        periodStart: input.window.periodStart,
        periodEnd: input.window.periodEnd
      });

      throw new QuotaExceededError(
        getQuotaExceededMessage(input.meterKey),
        input.organizationId,
        input.meterKey,
        snapshot
      );
    }
  } else {
    await input.tx.usageMeter.update({
      where: { id: existing.id },
      data: {
        usedQuantity: {
          increment: input.quantity
        },
        limitQuantity: null,
        lastEventAt: input.occurredAt
      }
    });
  }

  return input.tx.usageMeter.findUniqueOrThrow({
    where: { id: existing.id }
  });
}

export async function recordUsageEvent(
  input: RecordUsageEventInput,
  db: UsageQuotaDbClient = prisma
): Promise<RecordUsageEventResult> {
  const quantity = coerceQuantity(input.quantity);
  const occurredAt = input.occurredAt ?? new Date();
  const window = getUsagePeriodWindow(occurredAt);

  return runUsageTransaction(db, async (tx) => {
    const existingEvent = await tx.usageEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { usageMeter: true }
    });

    if (existingEvent) {
      const snapshot = buildUsageRemainingSnapshot({
        organizationId: input.organizationId,
        meterKey: input.meterKey,
        limit: existingEvent.usageMeter?.limitQuantity ?? null,
        used: existingEvent.usageMeter?.usedQuantity ?? existingEvent.quantity,
        periodStart: existingEvent.periodStart,
        periodEnd: existingEvent.periodEnd
      });

      return {
        recorded: false,
        snapshot
      };
    }

    const { limit, subscriptionId } = await getUsageLimitContext(
      input.organizationId,
      input.meterKey,
      tx
    );

    const meter = await incrementUsageMeter({
      tx,
      organizationId: input.organizationId,
      subscriptionId,
      meterKey: input.meterKey,
      quantity,
      limit,
      window,
      occurredAt
    });

    await tx.usageEvent.create({
      data: {
        organizationId: input.organizationId,
        subscriptionId,
        usageMeterId: meter.id,
        meterKey: getUsageMeterKeyValue(input.meterKey),
        quantity,
        idempotencyKey: input.idempotencyKey,
        source: input.source,
        sourceRecordType: input.sourceRecordType ?? null,
        sourceRecordId: input.sourceRecordId ?? null,
        metadata: input.metadata ?? undefined,
        occurredAt,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd
      }
    });

    return {
      recorded: true,
      snapshot: buildUsageRemainingSnapshot({
        organizationId: input.organizationId,
        meterKey: input.meterKey,
        limit,
        used: meter.usedQuantity,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd
      })
    };
  });
}
