import Link from "next/link";
import { prisma } from "@evolve-edge/db";
import { Prisma, prisma } from "@evolve-edge/db";
import { requireCurrentSession } from "../../../lib/auth";
import { getOrganizationEntitlements } from "../../../lib/entitlements";
import { logServerEvent } from "../../../lib/monitoring";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError
} from "../../../lib/prisma-runtime";

export const dynamic = "force-dynamic";

const roadmapAssessmentInclude = {
  recommendations: {
    orderBy: [{ priority: "asc" }, { sortOrder: "asc" }]
  },
  reports: {
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 1
  }
} satisfies Prisma.AssessmentInclude;

function renderRoadmapFallback() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Roadmap</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Roadmap unavailable
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
              Remediation roadmap data is temporarily unavailable. This page is
              showing a safe fallback state instead of failing.
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
          Roadmap data is unavailable right now.
        </div>
      </div>
    </main>
  );
}

export default async function RoadmapPage() {
  const session = await requireCurrentSession({ requireOrganization: true });
  const [assessments, entitlements] = await Promise.all([
    prisma.assessment.findMany({
      where: { organizationId: session.organization!.id },
      include: {
        recommendations: {
          orderBy: [{ priority: "asc" }, { sortOrder: "asc" }]
        },
        reports: {
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    getOrganizationEntitlements(session.organization!.id)
  ]);
  type RoadmapAssessment = Prisma.AssessmentGetPayload<{
    include: typeof roadmapAssessmentInclude;
  }>;

  let assessments: RoadmapAssessment[] = [];
  let entitlements: Awaited<ReturnType<typeof getOrganizationEntitlements>> | null = null;

  try {
    [assessments, entitlements] = await Promise.all([
      prisma.assessment.findMany({
        where: { organizationId: session.organization!.id },
        include: roadmapAssessmentInclude,
        orderBy: { createdAt: "desc" }
      }),
      getOrganizationEntitlements(session.organization!.id)
    ]);
  } catch (error) {
    if (isPrismaRuntimeCompatibilityError(error)) {
      logPrismaRuntimeCompatibilityError("dashboard.roadmap", error, {
        organizationId: session.organization!.id
      });
    } else {
      logServerEvent("error", "dashboard.roadmap.fallback", {
        organizationId: session.organization!.id,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }

    return renderRoadmapFallback();
  }

  const tasks = assessments.flatMap((assessment) =>
    assessment.recommendations.map((recommendation) => ({