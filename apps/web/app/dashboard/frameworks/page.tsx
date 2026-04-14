
import type { Route } from "next";
import { requireOrganizationPermission } from "../../../lib/auth";
import { getFrameworkOverviewSnapshot } from "../../../lib/framework-intelligence";
import { logServerEvent } from "../../../lib/monitoring";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError
} from "../../../lib/prisma-runtime";

export const dynamic = "force-dynamic";

  }).format(date);
}

function renderFrameworksFallback() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Framework Intelligence</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Framework data unavailable
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
              Framework posture and mapped control data are temporarily unavailable.
              This page is rendering a safe fallback state until workspace support
              records are fully available again.
            </p>
          </div>
          <Link
            href={"/dashboard" as Route}
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-dashed border-line bg-white p-8 text-sm text-steel">
          No framework data is available yet.
        </div>
      </div>
    </main>
  );
}

export default async function FrameworksPage() {
  const session = await requireOrganizationPermission("findings.view");
  const snapshot = await getFrameworkOverviewSnapshot(session.organization!.id);
  let snapshot: Awaited<ReturnType<typeof getFrameworkOverviewSnapshot>> | null = null;

  try {
    snapshot = await getFrameworkOverviewSnapshot(session.organization!.id);
  } catch (error) {
    if (isPrismaRuntimeCompatibilityError(error)) {
      logPrismaRuntimeCompatibilityError("dashboard.frameworks", error, {
        organizationId: session.organization!.id
      });
    } else {
      logServerEvent("error", "dashboard.frameworks.fallback", {
        organizationId: session.organization!.id,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }

    return renderFrameworksFallback();
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">