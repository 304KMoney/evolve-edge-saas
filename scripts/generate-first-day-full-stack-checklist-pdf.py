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


OUTPUT_PATH = Path("docs/first-day-full-stack-engineer-22-hour-checklist.pdf")


def checkbox_items(items, style):
    return ListFlowable(
        [
            ListItem(Paragraph(item, style), value="\u2610")
            for item in items
        ],
        bulletType="bullet",
        start=None,
        leftIndent=18,
    )


def heading(text, style):
    return Paragraph(text, style)


def body(text, style):
    return Paragraph(text, style)


def build_pdf():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=LETTER,
        rightMargin=0.6 * inch,
        leftMargin=0.6 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.6 * inch,
        title="First-Day Full-Stack Engineer Checklist",
        author="OpenAI Codex",
    )

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="ChecklistTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ChecklistH1",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#0F172A"),
            spaceBefore=8,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ChecklistBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.2,
            leading=12,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ChecklistMeta",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#334155"),
            alignment=TA_CENTER,
            spaceAfter=2,
        )
    )

    title_style = styles["ChecklistTitle"]
    h1 = styles["ChecklistH1"]
    body_style = styles["ChecklistBody"]
    meta_style = styles["ChecklistMeta"]

    story = []
    story.append(heading("First-Day Full-Stack Engineer Checklist", title_style))
    story.append(body("Prepared April 26, 2026", meta_style))
    story.append(body("Deadline: 22 working hours from assignment", meta_style))
    story.append(body("Audience: first-day full-stack engineer", meta_style))
    story.append(Spacer(1, 0.12 * inch))

    summary_table = Table(
        [
            ["Mission", "Stabilize repo truth, verify launch readiness, and hand off exact blockers without breaking state boundaries."],
            ["Primary Output", "One honest go/no-go status plus a clean missing-env and live-access blocker list."],
            ["Today Is Not For", "Re-architecting Stripe, n8n, HubSpot, or AI ownership."],
        ],
        colWidths=[1.35 * inch, 5.95 * inch],
    )
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.6),
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
    story.append(summary_table)
    story.append(Spacer(1, 0.18 * inch))

    story.append(heading("Definition Of Done For Day One", h1))
    story.append(
        checkbox_items(
            [
                "Repo installs cleanly and <b>pnpm typecheck</b> passes.",
                "App-owned readiness commands are run and their outputs are saved.",
                "Missing environment variables are proven, not guessed.",
                "Code issues are separated from environment and access blockers.",
                "Any repo-level inconsistency found today is fixed with targeted verification.",
                "Final handoff names the next safe action in 2-4 hours.",
            ],
            body_style,
        )
    )

    story.append(heading("Current Local Blockers", h1))
    story.append(
        checkbox_items(
            [
                "AUTH_SECRET",
                "All canonical Stripe launch envs",
                "N8N_WORKFLOW_DESTINATIONS with auditRequested",
                "N8N callback and outbound dispatch secrets",
                "AI_EXECUTION_PROVIDER, AI_EXECUTION_DISPATCH_SECRET, OPENAI_API_KEY, OPENAI_MODEL",
                "REPORT_DOWNLOAD_SIGNING_SECRET",
                "EMAIL_FROM_ADDRESS, RESEND_API_KEY, RESEND_WEBHOOK_SIGNING_SECRET",
                "NOTIFICATION_DISPATCH_SECRET, CRON_SECRET, OPS_READINESS_SECRET, PUBLIC_INTAKE_SHARED_SECRET",
            ],
            body_style,
        )
    )

    story.append(heading("22-Hour Execution Plan", h1))
    phases = [
        (
            "Hour 0-2: Boot And Boundaries",
            [
                "Read AGENTS.md and launch-readiness docs.",
                "Confirm source-of-truth boundaries before changing code.",
                "Run pnpm db:generate.",
                "Run pnpm typecheck.",
            ],
        ),
        (
            "Hour 2-5: Readiness Snapshot",
            [
                "Run pnpm integration:status.",
                "Run pnpm preflight:first-customer:env.",
                "Run pnpm preflight:first-customer.",
                "Save exact outputs for handoff.",
            ],
        ),
        (
            "Hour 5-9: Environment Inventory",
            [
                "Check root .env and .env.local.",
                "Check apps/web/.env.local.",
                "Prove whether missing secrets truly do not exist locally.",
                "Do not invent launch-critical values.",
            ],
        ),
        (
            "Hour 9-14: Safe Repo Fixes",
            [
                "Fix additive or fail-closed readiness drift only.",
                "Add or update targeted tests.",
                "Re-run targeted tests and pnpm typecheck.",
                "Update the nearest matching doc.",
            ],
        ),
        (
            "Hour 14-18: Launch-Path Verification",
            [
                "Mark each lane as ready, blocked-env, or blocked-access.",
                "Confirm Neon and Vercel link state.",
                "Confirm Stripe, n8n, AI, and delivery secret readiness.",
            ],
        ),
        (
            "Hour 18-22: Final Handoff",
            [
                "Produce blocker table.",
                "List commands run and tests run.",
                "State go/no-go clearly.",
                "Name the next safe action.",
            ],
        ),
    ]

    for phase_name, tasks in phases:
        story.append(body(f"<b>{phase_name}</b>", body_style))
        story.append(checkbox_items(tasks, body_style))

    story.append(PageBreak())

    story.append(heading("Hard No-Go Rules", h1))
    story.append(
        checkbox_items(
            [
                "Do not launch if pnpm preflight:first-customer fails.",
                "Do not launch if pnpm typecheck fails.",
                "Do not launch if Stripe canonical price or product envs are missing.",
                "Do not launch if auditRequested is missing from N8N_WORKFLOW_DESTINATIONS.",
                "Do not launch if OpenAI/LangGraph execution secrets are missing.",
                "Do not launch if signed report auth or delivery secrets are missing.",
                "Do not make HubSpot or Apollo authoritative for app state.",
            ],
            body_style,
        )
    )

    story.append(heading("First-Day Deliverables", h1))
    story.append(
        checkbox_items(
            [
                "One short repo-health summary",
                "One exact missing-env inventory",
                "One list of commands run",
                "One list of tests run",
                "One blocker list that needs operator or platform access",
                "One recommendation: continue repo work, request secrets, or schedule live validation",
            ],
            body_style,
        )
    )

    story.append(heading("Suggested Final Handoff Template", h1))
    handoff_table = Table(
        [
            ["Overall", "GO / NO-GO / PARTIAL"],
            ["Repo health", ""],
            ["Local env health", ""],
            ["Verified today", ""],
            ["Blocked by missing secrets", ""],
            ["Blocked by missing third-party access", ""],
            ["Next safe action in 2-4 hours", ""],
        ],
        colWidths=[2.1 * inch, 5.2 * inch],
    )
    handoff_table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.8),
                ("LEADING", (0, 0), (-1, -1), 10.8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    story.append(handoff_table)

    doc.build(story)


if __name__ == "__main__":
    build_pdf()
