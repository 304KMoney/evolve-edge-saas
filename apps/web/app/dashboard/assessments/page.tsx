import Link from "next/link";

const assessments = [
  {
    name: "Q2 AI Governance Review",
    status: "Analysis running",
    frameworks: "SOC 2, HIPAA, NIST CSF",
    updatedAt: "Updated 11 minutes ago"
  },
  {
    name: "Vendor AI Tool Inventory",
    status: "Intake in progress",
    frameworks: "ISO 27001, GDPR",
    updatedAt: "Updated yesterday"
  }
];

export default function AssessmentsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Assessments</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Active assessment queue
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="mt-8 space-y-4">
          {assessments.map((assessment) => (
            <div
              key={assessment.name}
              className="rounded-2xl border border-line bg-mist p-5"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">
                    {assessment.name}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    {assessment.frameworks}
                  </p>
                </div>
                <div className="text-sm text-steel">
                  <p>{assessment.status}</p>
                  <p className="mt-1">{assessment.updatedAt}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
