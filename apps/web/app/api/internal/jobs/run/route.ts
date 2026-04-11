import { NextResponse } from "next/server";
import { requireCronSecret, runScheduledJobs } from "../../../../../lib/jobs";
import { sendOperationalAlert } from "../../../../../lib/monitoring";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const expected = requireCronSecret();
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  return provided === expected;
}

async function handleJobRun(request: Request, triggerSource: string) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const job = searchParams.get("job");
    const result = await runScheduledJobs({
      job,
      triggerSource
    });

    return NextResponse.json(result);
  } catch (error) {
    await sendOperationalAlert({
      source: "api.internal.jobs.run",
      title: "Scheduled jobs API failed",
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handleJobRun(request, "cron");
}

export async function POST(request: Request) {
  return handleJobRun(request, "manual");
}
