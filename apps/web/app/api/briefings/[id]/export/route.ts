import { NextResponse } from "next/server";
import {
  briefingToMarkdown,
  getExecutiveBriefingById
} from "../../../../../lib/executive-briefing";
import { requireOrganizationPermissionForOrganization } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const briefing = await getExecutiveBriefingById(id);

  if (!briefing) {
    return NextResponse.json({ error: "Briefing not found." }, { status: 404 });
  }

  await requireOrganizationPermissionForOrganization(
    "reports.view",
    briefing.organizationId
  );

  return new NextResponse(briefingToMarkdown(briefing), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${briefing.id}.md"`
    }
  });
}
