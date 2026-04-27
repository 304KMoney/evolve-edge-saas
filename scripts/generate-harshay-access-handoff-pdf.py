from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUTPUT_PATH = Path("docs/team/harshay-access-handoff-2026-04-27.pdf")


def p(text, style):
    return Paragraph(text, style)


def table(rows, widths):
    flowable = Table(rows, colWidths=widths, repeatRows=1)
    flowable.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E2E8F0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.4),
                ("LEADING", (0, 0), (-1, -1), 9.2),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#0F172A")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return flowable


def bullets(items, style):
    return [p(f"- {item}", style) for item in items]


def build_pdf():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=LETTER,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch,
        title="Harshay Access Handoff",
        author="OpenAI Codex",
    )

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="HandoffTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="HandoffMeta",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.6,
            leading=10.4,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#334155"),
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="HandoffH1",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=11.4,
            leading=14,
            textColor=colors.HexColor("#0F172A"),
            spaceBefore=8,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="HandoffBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.6,
            leading=10.7,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="HandoffSmall",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=7.4,
            leading=9,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=2,
        )
    )

    title = styles["HandoffTitle"]
    meta = styles["HandoffMeta"]
    h1 = styles["HandoffH1"]
    body = styles["HandoffBody"]
    small = styles["HandoffSmall"]

    story = [
        p("Harshay Access Handoff", title),
        p("Prepared April 27, 2026", meta),
        p("Purpose: grant useful access without exposing secrets or weakening ownership boundaries", meta),
        Spacer(1, 0.08 * inch),
    ]

    story.append(p("Recommended Reply", h1))
    story.append(
        p(
            "Hi Harshay, absolutely. I will grant access in batches as each system is ready. For security, I will send platform invitations directly where possible and put any required secrets in the shared password manager or secret vault rather than sending credentials in email or chat. For Vercel, I will send the invite to <b>harshay.imag3@gmail.com</b> so it matches the GitHub-linked email. I will also share <b>.env.example</b> and local setup notes, but not my personal <b>.env</b> file because it may contain live credentials, webhook secrets, API keys, and database connection strings.",
            body,
        )
    )

    story.append(p("Acceptable Vs Not Acceptable", h1))
    story.append(
        table(
            [
                ["Acceptable", "Not Acceptable"],
                ["Vendor dashboard invitations; repo .env.example; scoped dev/preview secrets through vault; dedicated test account; runbook links.", "Sending .env, .env.local, Vercel env pulls, database URLs, API keys, or personal admin credentials over email/chat."],
                ["Read-only or developer-scoped access first; production write access only when needed and approved.", "Unrestricted live Stripe/admin access on day one or sharing founder/operator logins."],
            ],
            [3.45 * inch, 3.45 * inch],
        )
    )

    story.append(p("Access Matrix", h1))
    access_rows = [
        ["System", "Initial Access", "How To Provide", "Notes"],
        ["GitHub", "Repo write", "GitHub repo/team invite", "Needed to clone, branch, PR, and inspect history."],
        ["Neon", "Least privilege; read first", "Neon project invite", "Canonical persistence. Production write only if approved."],
        ["Dify", "Viewer/developer if needed", "Dify workspace invite", "Deprecated rollback/debug context only."],
        ["Test account", "Dedicated test user", "Create app user; send one-time secret via vault", "Never share founder/operator credentials."],
        ["Stripe", "Test-mode developer/read-only first", "Stripe team invite", "Billing authority and payment-event source only."],
        ["n8n", "Workflow viewer/developer", "n8n user invite", "Orchestration only; not pricing/routing authority."],
        ["Sentry", "Issue/project visibility", "Sentry invite", "Errors, traces, releases, environment tags."],
        ["HubSpot", "Scoped CRM access", "HubSpot user invite", "CRM projection only."],
        ["Vercel", "Project developer", "Invite harshay.imag3@gmail.com", "Preview/Production visibility; env write only if managing config."],
        ["Secret vault", "Scoped collection", "Password manager invite", "Use for local/preview secrets and test credentials."],
    ]
    story.append(table(access_rows, [0.9 * inch, 1.35 * inch, 1.45 * inch, 3.2 * inch]))

    story.append(p("Local Environment Guidance", h1))
    story.extend(
        bullets(
            [
                "Share .env.example, README.md, docs/env-parity-guide.md, docs/vercel-env-fill-sheet.md, docs/team/engineering-access-checklist.md, and docs/team/harshay-day-one-package.md.",
                "Create Harshay's local .env.local from vault-provisioned development or preview values only.",
                "Do not directly send .env, .env.local, .tmp-development-env-pull, .tmp-preview-env-current, .tmp-preview-env-pull*, or .tmp-production-env-pull.",
            ],
            body,
        )
    )

    story.append(p("Minimum Local Secrets To Provision If In Scope", h1))
    story.extend(
        bullets(
            [
                "DATABASE_URL, AUTH_SECRET, AUTH_ACCESS_EMAIL, AUTH_ACCESS_PASSWORD.",
                "Stripe test-mode secret, webhook secret, and canonical product/price IDs.",
                "N8N_WORKFLOW_DESTINATIONS, N8N_CALLBACK_SHARED_SECRET, OUTBOUND_DISPATCH_SECRET.",
                "AI_EXECUTION_DISPATCH_SECRET and scoped OPENAI_API_KEY if live AI execution is in scope.",
                "REPORT_DOWNLOAD_SIGNING_SECRET and sandbox email-provider credentials if delivery testing is in scope.",
                "HUBSPOT_ACCESS_TOKEN and Sentry DSNs only if those slices are in scope.",
            ],
            small,
        )
    )

    story.append(p("Suggested Access Order", h1))
    story.extend(
        bullets(
            [
                "GitHub, then Vercel, then secret vault.",
                "Neon preview visibility, then Evolve Edge test account.",
                "Stripe test-mode, n8n, Sentry, HubSpot, then Dify only for rollback/debug context.",
            ],
            body,
        )
    )

    story.append(p("Verification Checklist", h1))
    story.extend(
        bullets(
            [
                "GitHub clone, pnpm install, pnpm db:generate, and local boot succeed.",
                ".env.local is populated from vault values, not copied from founder machine files.",
                "Test user login works; Vercel deployments/logs are visible; Neon visibility is sufficient.",
                "Stripe test-mode products/prices/webhooks, n8n workflows/executions, Sentry issues, and HubSpot integration objects are visible if in scope.",
            ],
            body,
        )
    )

    story.append(p("Source-Of-Truth Boundaries", h1))
    story.extend(
        bullets(
            [
                "Next.js owns product logic and customer-visible state; Neon/Postgres owns persistence.",
                "Stripe is billing authority only; n8n is orchestration only; LangGraph is workflow orchestration only; OpenAI is model execution only.",
                "Dify is deprecated rollback compatibility only; HubSpot is CRM projection only; Hostinger is brochure/top-of-funnel only.",
            ],
            body,
        )
    )

    doc.build(story)


if __name__ == "__main__":
    build_pdf()
    print(OUTPUT_PATH)
