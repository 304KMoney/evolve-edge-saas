import { getCurrentSession } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  await getCurrentSession();

  return children;
}
