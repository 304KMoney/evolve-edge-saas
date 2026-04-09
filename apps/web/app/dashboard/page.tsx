import { DashboardShell } from "../../components/dashboard-shell";
import { getDashboardData } from "../../lib/dashboard";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return <DashboardShell data={data} />;
}
