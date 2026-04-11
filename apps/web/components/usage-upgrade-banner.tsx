import Link from "next/link";
import { UsageMetricSnapshot } from "../lib/usage-metering";

export function UsageUpgradeBanner({
  metric
}: {
  metric: UsageMetricSnapshot | null;
}) {
  if (!metric || (metric.status !== "warning" && metric.status !== "exceeded")) {
    return null;
  }

  const toneClass =
    metric.status === "exceeded"
      ? "border-amber-200 bg-amber-50 text-warning"
      : "border-sky-200 bg-sky-50 text-sky-700";

  return (
    <div className={`rounded-2xl border p-4 text-sm ${toneClass}`}>
      <p className="font-semibold">{metric.upgradeTitle}</p>
      <p className="mt-2 leading-6">
        {metric.upgradeBody} {metric.helperText}
      </p>
      <Link href={metric.actionHref as never} className="mt-3 inline-flex font-semibold">
        {metric.actionLabel}
      </Link>
    </div>
  );
}
