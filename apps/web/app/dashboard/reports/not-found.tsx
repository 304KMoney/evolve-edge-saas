import Link from "next/link";

export default function ReportsNotFound() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <p className="text-sm font-medium text-accent">Report Center</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">
          This report could not be found
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-steel">
          The report may have been removed, replaced by a newer delivery
          package, or the link may no longer match the current workspace.
        </p>
        <div className="mt-8 grid gap-4 rounded-[24px] border border-line bg-mist p-5 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-ink">What to do next</p>
            <p className="mt-2 text-sm leading-6 text-steel">
              Return to the report center to review available packages, or open
              support if you expected this report to be available for your team.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <Link
              href="/dashboard/reports"
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
            >
              Back to reports
            </Link>
            <Link
              href="/contact-sales"
              className="rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink"
            >
              Contact support
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
