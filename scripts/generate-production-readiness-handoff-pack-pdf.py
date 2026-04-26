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


OUTPUT_PATH = Path("docs/evolve-edge-first-day-engineer-production-readiness-handoff-pack.pdf")


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


def status_table(rows, col_widths):
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
        title="Evolve Edge Production-Readiness Handoff Pack",
        author="OpenAI Codex",
    )

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="PackTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=19,
            leading=23,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="PackH1",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=12.5,
            leading=15.5,
            textColor=colors.HexColor("#0F172A"),
            spaceBefore=8,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="PackBody",
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
            name="PackMeta",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.8,
            leading=10.5,
            textColor=colors.HexColor("#334155"),
            alignment=TA_CENTER,
            spaceAfter=2,
        )
    )

    title_style = styles["PackTitle"]
    h1 = styles["PackH1"]
    body_style = styles["PackBody"]
    meta_style = styles["PackMeta"]

    story = [
        heading("Evolve Edge Production-Readiness Handoff Pack", title_style),
        body("Prepared April 26, 2026", meta_style),
        body("Audience: first-day full-stack engineer", meta_style),
        body("Timebox: 22 working hours", meta_style),
        Spacer(1, 0.12 * inch),
    ]

    story.append(
        status_table(
            [
                ["Category", "Summary"],
                ["Purpose", "Give a senior engineer a clean first-day workflow for production-readiness review."],
                ["Expected Output", "One honest go, no-go, or partial recommendation backed by exact blockers."],
                ["Current State", "Repo-side readiness is much clearer, but live launch is still blocked by missing environment configuration."],
            ],
            [1.45 * inch, 5.55 * inch],
        )
    )
    story.append(Spacer(1, 0.16 * inch))

    story.append(heading("First-Day Mission", h1))
    story.append(
        checkbox_items(
            [
                "Preserve app-owned control of billing, routing, lifecycle, and delivery state.",
                "Verify the current local and external-system readiness picture without guessing.",
                "Fix only additive or fail-closed repo drift.",
                "Leave a clear handoff for anything that still requires operator credentials or console access.",
            ],
            body_style,
        )
    )

    story.append(heading("Current Known Local Blockers", h1))
    story.append(
        checkbox_items(
            [
                "AUTH_SECRET",
                "All canonical Stripe launch envs",
                "N8N_WORKFLOW_DESTINATIONS with auditRequested",
                "n8n callback secret and outbound dispatch secret",
                "AI_EXECUTION_PROVIDER, AI_EXECUTION_DISPATCH_SECRET, OPENAI_API_KEY, OPENAI_MODEL",
                "REPORT_DOWNLOAD_SIGNING_SECRET",
                "EMAIL_FROM_ADDRESS, RESEND_API_KEY, RESEND_WEBHOOK_SIGNING_SECRET",
                "NOTIFICATION_DISPATCH_SECRET, CRON_SECRET, OPS_READINESS_SECRET, PUBLIC_INTAKE_SHARED_SECRET",
            ],
            body_style,
        )
    )

    story.append(heading("22-Hour First-Day Workflow", h1))
    phases = [
        ("Hour 0-2", ["Read AGENTS.md and launch docs.", "Run pnpm db:generate.", "Run pnpm typecheck."]),
        ("Hour 2-5", ["Run pnpm integration:status.", "Run pnpm preflight:first-customer:env.", "Run pnpm preflight:first-customer."]),
        ("Hour 5-9", ["Audit .env files.", "Confirm real missing values.", "Do not invent launch-critical placeholders."]),
        ("Hour 9-14", ["Fix only safe repo drift.", "Add targeted tests.", "Re-run tests and typecheck."]),
        ("Hour 14-18", ["Review Neon, Vercel, Stripe, n8n, AI, and delivery lanes.", "Mark each lane ready, blocked-env, or blocked-access."]),
        ("Hour 18-22", ["Write the blocker table.", "State go, no-go, or partial.", "Name the next safe action."]),
    ]
    for phase_name, items in phases:
        story.append(body(f"<b>{phase_name}</b>", body_style))
        story.append(checkbox_items(items, body_style))

    story.append(PageBreak())

    story.append(heading("Required Environment Matrix", h1))
    story.append(
        status_table(
            [
                ["Lane", "Required Values"],
                ["Core App", "DATABASE_URL, AUTH_SECRET, NEXT_PUBLIC_APP_URL"],
                ["Stripe", "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, all canonical Stripe price and product envs"],
                ["n8n", "N8N_WORKFLOW_DESTINATIONS, N8N_CALLBACK_SECRET or N8N_CALLBACK_SHARED_SECRET, OUTBOUND_DISPATCH_SECRET"],
                ["OpenAI/LangGraph", "AI_EXECUTION_PROVIDER, AI_EXECUTION_DISPATCH_SECRET, OPENAI_API_KEY, OPENAI_MODEL, optional OPENAI_REASONING_MODEL"],
                ["Delivery/Ops", "REPORT_DOWNLOAD_SIGNING_SECRET, EMAIL_FROM_ADDRESS, RESEND_API_KEY, RESEND_WEBHOOK_SIGNING_SECRET, NOTIFICATION_DISPATCH_SECRET, CRON_SECRET, OPS_READINESS_SECRET, PUBLIC_INTAKE_SHARED_SECRET"],
                ["Optional", "HUBSPOT_ACCESS_TOKEN, Apollo enrichment settings when explicitly needed"],
            ],
            [1.45 * inch, 5.55 * inch],
        )
    )

    story.append(heading("External-System Review Checklist", h1))
    systems = [
        ("Neon", ["Confirm DB reachability.", "Confirm Prisma generation succeeds.", "Confirm schema is current."]),
        ("Vercel", ["Confirm .vercel/project.json link.", "Confirm env ownership path.", "Confirm preview versus production expectations."]),
        ("Stripe", ["Confirm canonical envs exist.", "Confirm webhook secret exists.", "Confirm backend mapping is authoritative."]),
        ("n8n", ["Confirm auditRequested destination exists.", "Confirm callback secret path.", "Confirm outbound dispatch secret."]),
        ("OpenAI/LangGraph", ["Confirm provider envs exist.", "Confirm model path is intentional.", "Confirm one execution path when access exists."]),
        ("Delivery/Ops", ["Confirm report signing secret.", "Confirm Resend API and webhook secrets.", "Confirm notification, cron, ops, and intake secrets."]),
        ("HubSpot", ["Treat as projection-only.", "Check only if the assigned slice depends on it."]),
    ]
    for system_name, items in systems:
        story.append(body(f"<b>{system_name}</b>", body_style))
        story.append(checkbox_items(items + ["Mark status: ready, blocked-env, or blocked-access."], body_style))

    story.append(PageBreak())

    story.append(heading("Recommended Commands And Smoke Tests", h1))
    story.append(
        checkbox_items(
            [
                "pnpm install",
                "pnpm db:generate",
                "pnpm typecheck",
                "pnpm integration:status",
                "pnpm preflight:first-customer:env",
                "pnpm preflight:first-customer",
                "targeted tsx tests for any changed readiness or integration slice",
                "node scripts/validate-required-env.js production",
            ],
            body_style,
        )
    )
    story.append(body("<b>Use live integration smoke tests only when the environment and access already exist.</b>", body_style))

    story.append(heading("Hard No-Go Rules", h1))
    story.append(
        checkbox_items(
            [
                "Do not launch if pnpm preflight:first-customer fails.",
                "Do not launch if pnpm typecheck fails.",
                "Do not launch if Stripe canonical envs are missing.",
                "Do not launch if auditRequested is missing from N8N_WORKFLOW_DESTINATIONS.",
                "Do not launch if OpenAI/LangGraph execution secrets are missing.",
                "Do not launch if report signing, email, or ops secrets are missing.",
                "Do not treat HubSpot, Apollo, Stripe, or n8n as the source of truth for app-owned state.",
            ],
            body_style,
        )
    )

    story.append(heading("Go Or No-Go Acceptance Criteria", h1))
    story.append(
        status_table(
            [
                ["Status", "Meaning"],
                ["GO", "Repo checks pass, first-customer preflight passes, required envs exist, and no blocking code drift remains."],
                ["PARTIAL", "Repo health is solid, but launch is still blocked by external configuration or access that is clearly documented."],
                ["NO-GO", "Core checks fail, launch-critical envs are missing, or important control-path ambiguity still exists."],
            ],
            [1.2 * inch, 5.8 * inch],
        )
    )

    story.append(heading("Reviewer Signoff Sheet", h1))
    story.append(
        status_table(
            [
                ["Field", "Reviewer Notes"],
                ["Overall status", ""],
                ["Repo health", ""],
                ["Local env health", ""],
                ["Neon", ""],
                ["Vercel", ""],
                ["Stripe", ""],
                ["n8n", ""],
                ["OpenAI/LangGraph", ""],
                ["Delivery/Ops", ""],
                ["HubSpot", ""],
                ["Commands run", ""],
                ["Tests run", ""],
                ["Missing secrets", ""],
                ["Missing third-party access", ""],
                ["Next safe action in 2-4 hours", ""],
                ["Owner for next action", ""],
                ["Review date", ""],
            ],
            [2.05 * inch, 4.95 * inch],
        )
    )

    doc.build(story)


if __name__ == "__main__":
    build_pdf()
