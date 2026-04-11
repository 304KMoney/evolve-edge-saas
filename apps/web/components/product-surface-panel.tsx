import Link from "next/link";
import type {
  ProductSurfaceCalloutTone,
  ProductSurfaceModel
} from "../lib/product-surface";

function getCardToneClass(status: ProductSurfaceModel["cards"][number]["status"]) {
  switch (status) {
    case "exceeded":
      return "border-amber-200 bg-amber-50";
    case "warning":
      return "border-sky-200 bg-sky-50";
    case "locked":
      return "border-rose-200 bg-rose-50";
    default:
      return "border-line bg-mist";
  }
}

function getCalloutToneClass(tone: ProductSurfaceCalloutTone) {
  switch (tone) {
    case "danger":
      return "border-amber-200 bg-amber-50 text-warning";
    case "warning":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "neutral":
    default:
      return "border-line bg-mist text-steel";
  }
}

export function ProductSurfacePanel({
  model,
  secondaryNote
}: {
  model: ProductSurfaceModel;
  secondaryNote?: string | null;
}) {
  return (
    <section className="rounded-3xl border border-line bg-white p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-accent">{model.title}</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">{model.planName}</h2>
          <p className="mt-2 text-sm font-medium text-steel">{model.workspaceModeLabel}</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
            {model.description}
          </p>
          <p className="mt-3 text-sm text-steel">{model.planDetail}</p>
          {secondaryNote ? (
            <p className="mt-3 text-sm text-steel">{secondaryNote}</p>
          ) : null}
        </div>
      </div>

      {model.callout ? (
        <div
          className={`mt-5 rounded-2xl border p-4 text-sm ${getCalloutToneClass(
            model.callout.tone
          )}`}
        >
          <p className="font-semibold">{model.callout.title}</p>
          <p className="mt-2 leading-6">{model.callout.body}</p>
          <Link
            href={model.callout.actionHref as never}
            className="mt-3 inline-flex font-semibold"
          >
            {model.callout.actionLabel}
          </Link>
        </div>
      ) : null}

      {model.cards.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {model.cards.map((card) => (
            <article
              key={card.key}
              className={`rounded-2xl border p-4 ${getCardToneClass(card.status)}`}
            >
              <p className="text-xs uppercase tracking-[0.18em] text-steel">
                {card.label}
              </p>
              <p className="mt-3 text-2xl font-semibold text-ink">{card.value}</p>
              <p className="mt-2 text-sm text-steel">{card.helperText}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
