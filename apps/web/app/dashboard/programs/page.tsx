
  formatEngagementProgramType,
  getOrganizationEngagementSnapshot
} from "../../../lib/engagement-programs";
import { logServerEvent } from "../../../lib/monitoring";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError
} from "../../../lib/prisma-runtime";

export const dynamic = "force-dynamic";

    .join(" ");
}

function renderProgramsFallback() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Programs</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Program data unavailable
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
              Program history and remediation continuity data are temporarily unavailable.
              This page is rendering a safe fallback state.
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
          No program data is available yet.
        </div>
      </div>
    </main>
  );
}

export default async function ProgramsPage() {
  const session = await requireCurrentSession({ requireOrganization: true });
  const snapshot = await getOrganizationEngagementSnapshot(session.organization!.id, {
    synchronize: true
  });
  let snapshot: Awaited<ReturnType<typeof getOrganizationEngagementSnapshot>> | null = null;

  try {
    snapshot = await getOrganizationEngagementSnapshot(session.organization!.id, {
      synchronize: true
    });
  } catch (error) {
    if (isPrismaRuntimeCompatibilityError(error)) {
      logPrismaRuntimeCompatibilityError("dashboard.programs", error, {
        organizationId: session.organization!.id
      });
    } else {
      logServerEvent("error", "dashboard.programs.fallback", {
        organizationId: session.organization!.id,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }

    return renderProgramsFallback();
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">