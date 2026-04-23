import { redirect } from "next/navigation";
import { requireCurrentSession } from "../../../../lib/auth";
import { getServerAuditRequestContext } from "../../../../lib/audit";
import { createOrReuseAssessmentWorkspace } from "../../../../lib/assessment-start";

export const dynamic = "force-dynamic";

export default async function StartAssessmentPage() {
  const session = await requireCurrentSession({ requireOrganization: true });
  const requestContext = await getServerAuditRequestContext();
  const result = await createOrReuseAssessmentWorkspace({
    session,
    requestContext
  });

  redirect(
    `/dashboard/assessments/${result.assessmentId}${result.created ? "?created=1" : ""}`
  );
}
