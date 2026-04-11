import Link from "next/link";
import { UsageMetricSnapshot } from "../lib/usage-metering";

function statusClasses(status: UsageMetricSnapshot["status"]) {
  switch (status) {
    case "exceeded":
      return "border-amber-200 bg-amber-50";
    case "warning":
      return "border-sky-200 bg-sky-50";
    default:
      return "border-line bg-white";
  }
}

function statusLabel(metric: UsageMetricSnapshot) {
  switch (metric.status) {
    case "exceeded":
      return metric.enforcement === "hard" ? "Limit reached" : "Above target";
    case "warning":
      return "Approaching limit";
    case "unlimited":
      return "Tracked";
    default:
      return "Healthy";
  }
}

export function UsageMeterGrid({
  metrics,
  title,
  description
}: {
  metrics: UsageMetricSnapshot[];
  title?: string;
  description?: string;
}) {
  return (
    <section className="rounded-[24px] border border-line bg-mist p-5">
      {title ? <p className="text-lg font-semibold text-ink">{title}</p> : null}
      {description ? (
        <p className="mt-2 text-sm text-steel">{description}</p>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <article
            key={metric.key}
            className={`rounded-2xl border p-4 ${statusClasses(metric.status)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{metric.usageLabel}</p>
              </div>
              <span className="rounded-full border border-black/5 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-steel">
                {statusLabel(metric)}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-steel">{metric.helperText}</p>
            {(metric.status === "warning" || metric.status === "exceeded") && metric.limit !== null ? (
              <Link
                href={metric.actionHref as never}
                className="mt-4 inline-flex text-sm font-semibold text-accent"
              >
                {metric.actionLabel}
              </Link>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
