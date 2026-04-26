from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


OUTPUT_PATH = Path("docs/evolve-edge-engineer-meeting-access-and-call-guide.pdf")


def checkbox_items(items, style):
    return ListFlowable(
        [ListItem(Paragraph(item, style), value="\u2610") for item in items],
        bulletType="bullet",
        start=None,
        leftIndent=18,
    )


def heading(text, style):
    return Paragraph(text, style)


def body(text, style):
    return Paragraph(text, style)


def styled_table(rows, col_widths):
    table = Table(rows, colWidths=col_widths)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("LEADING", (0, 0), (-1, -1), 10.5),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#0F172A")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def build_pdf():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=LETTER,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.55 * inch,
        title="Evolve Edge Engineer Meeting Access And Call Guide",
        author="OpenAI Codex",
    )

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="GuideTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=18.5,
            leading=22,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="GuideH1",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=12.2,
            leading=15.2,
            textColor=colors.HexColor("#0F172A"),
            spaceBefore=8,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="GuideBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.9,
            leading=11.3,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="GuideMeta",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.8,
            leading=10.5,
            textColor=colors.HexColor("#334155"),
            alignment=TA_CENTER,
            spaceAfter=2,
        )
    )

    title_style = styles["GuideTitle"]
    h1 = styles["GuideH1"]
    body_style = styles["GuideBody"]
    meta_style = styles["GuideMeta"]

    story = [
        heading("Evolve Edge Engineer Meeting Access And Call Guide", title_style),
        body("Prepared April 26, 2026", meta_style),
        body("Audience: hiring manager, founder, or technical lead", meta_style),
        body("Use case: 1-2 hour onboarding and production-readiness review call", meta_style),
        Spacer(1, 0.12 * inch),
    ]

    story.append(
        styled_table(
            [
                ["Category", "Summary"],
                ["Goal", "Give a senior engineer the access and context needed to review production readiness fast and safely."],
                ["End State", "They leave the call knowing the architecture boundaries, their access level, and the 22-hour deliverables."],
                ["Important Constraint", "Do not expect them to guess around missing secrets or hidden production ownership."],
            ],
            [1.45 * inch, 5.55 * inch],
        )
    )
    story.append(Spacer(1, 0.16 * inch))

    story.append(heading("Access To Grant Before The Call", h1))
    story.append(
        checkbox_items(
            [
                "Git repository access with clone, branch, and pull request permissions",
                "Deployment workspace access for Evolve Edge",
                "Local environment variable handoff materials or secure secret-manager access",
                "Permission to install dependencies and run local scripts",
                "Neon project access",
                "Vercel project access",
                "Stripe dashboard access with product, price, and webhook visibility",
                "n8n workspace access",
                "OpenAI project or API-key provisioning path",
                "Resend or active email-provider access",
                "Access to cron, ops, report-signing, and notification secret sources",
                "Optional HubSpot and Apollo access only if those slices are in scope",
            ],
            body_style,
        )
    )

    story.append(heading("Minimum Safe Starting Permission Level", h1))
    story.append(
        checkbox_items(
            [
                "Repository write access",
                "Deployment and environment read access",
                "Third-party dashboard read access",
                "Ability to prepare changes for approval without requiring direct irreversible production mutation on day one",
            ],
            body_style,
        )
    )

    story.append(heading("What To Explain In The First 20 Minutes", h1))
    story.append(
        checkbox_items(
            [
                "What Evolve Edge does in one sentence",
                "Whether the assignment is review, stabilization, or full launch ownership",
                "What has already been fixed in the repo",
                "What is still blocked by environment or third-party access",
                "What success looks like by the end of the first 22 hours",
                "That the first responsibility is to verify truth, not guess",
            ],
            body_style,
        )
    )

    story.append(heading("Architecture Boundaries To Explain Clearly", h1))
    story.append(
        checkbox_items(
            [
                "Next.js app owns product logic and customer-visible state",
                "Neon/Postgres owns persistence",
                "Stripe is billing authority only",
                "n8n is orchestration only",
                "LangGraph is workflow orchestration only",
                "OpenAI is model execution only",
                "HubSpot is projection only",
                "Apollo is optional enrichment only",
                "Dify is deprecated rollback compatibility only",
            ],
            body_style,
        )
    )

    story.append(PageBreak())

    story.append(heading("60-Minute Call Agenda", h1))
    agenda_60 = [
        ("0-10 Minutes", "Introductions, role expectations, and whether the assignment is review, fix, or launch ownership."),
        ("10-25 Minutes", "Product summary, customer flow, and source-of-truth boundaries."),
        ("25-40 Minutes", "Current repo and environment reality, including missing-env categories and go or no-go posture."),
        ("40-50 Minutes", "Working norms: branches, review expectations, and how to request missing access."),
        ("50-60 Minutes", "Confirm the 22-hour deliverables, remaining access gaps, and approval path for production-facing changes."),
    ]
    story.append(
        styled_table(
            [["Time", "Focus"]] + agenda_60,
            [1.35 * inch, 5.65 * inch],
        )
    )

    story.append(heading("90-120 Minute Extended Call Agenda", h1))
    agenda_120 = [
        ("Environment Walkthrough", "Show where envs are managed, which secrets are canonical, and how preview and production differ."),
        ("Integration Walkthrough", "Stripe mapping and webhooks, n8n destinations and callbacks, OpenAI/LangGraph execution, and delivery/report-signing paths."),
        ("Q and A", "Surface ambiguities, missing access, and what the engineer would validate first."),
    ]
    story.append(
        styled_table(
            [["Section", "Focus"]] + agenda_120,
            [1.6 * inch, 5.4 * inch],
        )
    )

    story.append(heading("Current Known Gaps To Say Out Loud", h1))
    story.append(
        checkbox_items(
            [
                "The repo can explain readiness more honestly than before.",
                "Live launch is still blocked mostly by missing environment configuration and external-system verification.",
                "Current missing items include AUTH_SECRET, canonical Stripe envs, n8n workflow and callback envs, OpenAI/LangGraph execution envs, and delivery or ops secrets.",
                "The engineer should call out blocked-env and blocked-access conditions directly instead of working around them.",
            ],
            body_style,
        )
    )

    story.append(heading("Questions You Should Be Ready To Answer", h1))
    story.append(
        checkbox_items(
            [
                "Which environment is canonical right now",
                "Which secrets exist already and where",
                "Who owns Stripe configuration",
                "Who owns n8n workflow edits",
                "Who can approve Vercel production changes",
                "Whether HubSpot or Apollo is actually in scope for launch",
                "Whether there is any active incident or launch deadline pressure",
            ],
            body_style,
        )
    )

    story.append(heading("Questions You Should Ask The Engineer", h1))
    story.append(
        checkbox_items(
            [
                "Do you have enough access to verify the critical path",
                "Which blocker do you expect to hit first",
                "Would you classify this first pass as review or execution",
                "What would you need to make a trustworthy go or no-go call",
                "What would make the 22-hour window unrealistic",
            ],
            body_style,
        )
    )

    story.append(PageBreak())

    story.append(heading("Deliverables To Request After The Call", h1))
    story.append(
        checkbox_items(
            [
                "A short repo-health summary",
                "A missing-env and missing-access list",
                "Exact commands run",
                "Exact tests run",
                "Lane-by-lane readiness status",
                "A final recommendation: GO, PARTIAL, or NO-GO",
            ],
            body_style,
        )
    )

    story.append(heading("Practical Meeting Notes Template", h1))
    story.append(
        styled_table(
            [
                ["Field", "Notes"],
                ["Engineer", ""],
                ["Date", ""],
                ["Role scope", ""],
                ["Repo access granted", ""],
                ["Neon access granted", ""],
                ["Vercel access granted", ""],
                ["Stripe access granted", ""],
                ["n8n access granted", ""],
                ["OpenAI access granted", ""],
                ["Resend or email access granted", ""],
                ["HubSpot access granted", ""],
                ["Apollo access granted", ""],
                ["Known missing access", ""],
                ["First-day deadline", ""],
                ["Agreed deliverables", ""],
                ["Decision owner for production changes", ""],
                ["Next checkpoint", ""],
            ],
            [2.1 * inch, 4.9 * inch],
        )
    )

    story.append(heading("Recommended Closing Script", h1))
    story.append(
        body(
            '"Your first responsibility is to verify what is true, separate code issues from environment issues, and leave us with a trustworthy next-step recommendation. If something is blocked by access or missing secrets, call that out directly rather than working around it."',
            body_style,
        )
    )

    doc.build(story)


if __name__ == "__main__":
    build_pdf()
