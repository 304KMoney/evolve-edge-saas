import Link from "next/link";

const reports = [
  {
    title: "Board Summary - Q1 Assessment",
    type: "Executive PDF",
    status: "Published"
  },
  {
    title: "AI Risk Register - Q1",
    type: "Interactive report",
    status: "Published"
  }
];

export default function ReportsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Report Center</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Published reports
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="mt-8 grid gap-4">
          {reports.map((report) => (
            <article
              key={report.title}
              className="rounded-2xl border border-line bg-mist p-5"
            >
              <p className="text-lg font-semibold text-ink">{report.title}</p>
              <p className="mt-2 text-sm text-steel">
                {report.type} • {report.status}
              </p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

