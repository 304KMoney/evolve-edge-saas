import { requireCurrentSession } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  await requireCurrentSession({ requireOrganization: true });

  return children;
}
