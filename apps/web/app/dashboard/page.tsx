import { DashboardShell } from "../../components/dashboard-shell";
import { getDashboardData } from "../../lib/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ queued?: string; assessment?: string }>;
}) {
  const data = await getDashboardData();
  const params = await searchParams;
  const flashMessage =
    params.queued === "analysis"
      ? {
          title: "Analysis queued",
          body:
            "The intake was submitted successfully. Evolve Edge has queued the analysis workflow, and the dashboard will now reflect progress as findings and reports are generated."
        }
      : null;

  return <DashboardShell data={data} flashMessage={flashMessage} />;
}
