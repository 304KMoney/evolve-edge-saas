import Link from "next/link";

const tasks = [
  {
    title: "Approve AI acceptable use policy",
    owner: "Compliance Lead",
    due: "Apr 22",
    priority: "Urgent"
  },
  {
    title: "Add PHI guidance for AI copilots",
    owner: "Security + Operations",
    due: "Apr 29",
    priority: "High"
  }
];

export default function RoadmapPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Roadmap</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Remediation action plan
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
          {tasks.map((task) => (
            <div key={task.title} className="rounded-2xl border border-line bg-mist p-5">
              <p className="text-lg font-semibold text-ink">{task.title}</p>
              <p className="mt-2 text-sm text-steel">
                Owner: {task.owner} • Due: {task.due} • Priority: {task.priority}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

