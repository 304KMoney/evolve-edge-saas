import { requireCustomerAccessSession } from "../../lib/customer-access-session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  await requireCustomerAccessSession({ requireOrganization: true });

  return children;
}
