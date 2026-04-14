
import { formatBytes, getOrganizationUsageMeteringSnapshot } from "../../../lib/usage-metering";
import { getUsageRemaining } from "../../../lib/usage-quotas";
import { getCurrentSubscription } from "../../../lib/billing";
import { logServerEvent } from "../../../lib/monitoring";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError
} from "../../../lib/prisma-runtime";
import {
  createManualEvidenceNoteAction,
  uploadEvidenceAction
    .join(" ");
}

function renderEvidenceFallback() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Evidence Library</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Evidence data unavailable
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
              Evidence records and supporting inventory data are temporarily unavailable.
              This page is showing a safe fallback state instead of crashing.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-dashed border-line bg-white p-8 text-sm text-steel">
          Evidence data is unavailable right now.
        </div>
      </div>
    </main>
  );
}

export default async function EvidencePage({
  searchParams
}: {
  }>;
}) {
  const session = await requireOrganizationPermission("evidence.view");
  const params = await searchParams;
  let params: Awaited<typeof searchParams> = {};
  const authz = getSessionAuthorizationContext(session);
  const canManageEvidence = hasPermission(authz, "evidence.manage");
  const [snapshot, entitlements, subscription, evidenceUploadsQuota, documentsProcessedQuota] =
    await Promise.all([
      getEvidenceLibrarySnapshot(session.organization!.id, params),
      getOrganizationEntitlements(session.organization!.id),
      getCurrentSubscription(session.organization!.id),
      getUsageRemaining(session.organization!.id, "evidence_uploads"),
      getUsageRemaining(session.organization!.id, "documents_processed")
    ]);
  const usage = await getOrganizationUsageMeteringSnapshot(
    session.organization!.id,
    subscription?.planCodeSnapshot ?? subscription?.plan?.code ?? entitlements.planCode
  );
  const storageMetric = usage.metrics.find((metric) => metric.key === "storageBytes");
  let snapshot: Awaited<ReturnType<typeof getEvidenceLibrarySnapshot>> | null = null;
  let entitlements: Awaited<ReturnType<typeof getOrganizationEntitlements>> | null = null;
  let subscription: Awaited<ReturnType<typeof getCurrentSubscription>> | null = null;
  let evidenceUploadsQuota: Awaited<ReturnType<typeof getUsageRemaining>> | null = null;
  let documentsProcessedQuota: Awaited<ReturnType<typeof getUsageRemaining>> | null = null;
  let storageMetric:
    | ReturnType<Awaited<ReturnType<typeof getOrganizationUsageMeteringSnapshot>>["metrics"]["find"]>
    | undefined;

  try {
    params = await searchParams;
    [snapshot, entitlements, subscription, evidenceUploadsQuota, documentsProcessedQuota] =
      await Promise.all([
        getEvidenceLibrarySnapshot(session.organization!.id, params),
        getOrganizationEntitlements(session.organization!.id),
        getCurrentSubscription(session.organization!.id),
        getUsageRemaining(session.organization!.id, "evidence_uploads"),
        getUsageRemaining(session.organization!.id, "documents_processed")
      ]);
    const usage = await getOrganizationUsageMeteringSnapshot(
      session.organization!.id,
      subscription?.planCodeSnapshot ?? subscription?.plan?.code ?? entitlements.planCode
    );
    storageMetric = usage.metrics.find((metric) => metric.key === "storageBytes");
  } catch (error) {
    if (isPrismaRuntimeCompatibilityError(error)) {
      logPrismaRuntimeCompatibilityError("dashboard.evidence", error, {
        organizationId: session.organization!.id
      });
    } else {
      logServerEvent("error", "dashboard.evidence.fallback", {
        organizationId: session.organization!.id,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }

    return renderEvidenceFallback();
  }

  const productSurface = buildProductSurfaceModel({
    area: "evidence",
    entitlements,