import { DashboardShell } from "../../components/dashboard-shell";
import { getDashboardData } from "../../lib/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return <DashboardShell data={data} />;
}
