import Link from "next/link";

export default function SettingsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Billing & Settings</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Workspace controls
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Plan</p>
            <p className="mt-2 text-xl font-semibold text-ink">Growth Annual</p>
            <p className="mt-2 text-sm text-steel">
              Next renewal on May 17, 2026
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Seats</p>
            <p className="mt-2 text-xl font-semibold text-ink">5 of 8 used</p>
            <p className="mt-2 text-sm text-steel">
              Invite controls and role management come next.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
