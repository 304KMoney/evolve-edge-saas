"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import type { ResolvedUpsellOffer } from "../lib/expansion-engine";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function sendUpsellEvent(input: {
  eventType: "impression" | "click";
  offer: ResolvedUpsellOffer;
}) {
  const body = JSON.stringify({
    eventId: crypto.randomUUID(),
    eventType: input.eventType,
    offerKey: input.offer.key,
    offerType: input.offer.type,
    placement: input.offer.placement,
    trigger: input.offer.trigger,
    accountMaturity: input.offer.accountMaturity,
    ctaKind: input.offer.cta.kind,
    ctaTarget:
      input.offer.cta.kind === "link"
        ? input.offer.cta.href
        : input.offer.cta.kind === "checkout"
          ? input.offer.cta.planCode
          : input.offer.cta.action
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const payload = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/upsell/track", payload);
    return;
  }

  void fetch("/api/upsell/track", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body,
    keepalive: true
  });
}

export function UpsellOfferStack({
  offers,
  title = "Recommended expansion paths",
  description = "Relevant upgrade and add-on options based on how this workspace is being used."
}: {
  offers: ResolvedUpsellOffer[];
  title?: string;
  description?: string;
}) {
  const trackedImpressions = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const offer of offers) {
      if (trackedImpressions.current.has(offer.key)) {
        continue;
      }

      trackedImpressions.current.add(offer.key);
      sendUpsellEvent({
        eventType: "impression",
        offer
      });
    }
  }, [offers]);

  if (offers.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[24px] border border-[#d7eaeb] bg-[linear-gradient(180deg,#f7fcfc_0%,#eef8f7_100%)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#0f766e]">{title}</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#0f172a]">
            Conversion-ready expansion offers
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#526072]">
            {description}
          </p>
        </div>
        <div className="hidden rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#0f766e] md:flex">
          In-app revenue engine
        </div>
      </div>

      <div className={cn("mt-5 grid gap-4", offers.length > 1 && "xl:grid-cols-2")}>
        {offers.map((offer) => {
          const priorityClass =
            offer.priority === "high"
              ? "border-amber-200 bg-white"
              : offer.priority === "medium"
                ? "border-sky-200 bg-white"
                : "border-[#d7eaeb] bg-white";

          return (
            <article
              key={offer.key}
              className={cn("rounded-[22px] border p-5 shadow-sm", priorityClass)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex rounded-full bg-[#edf7f6] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">
                  {offer.badge}
                </span>
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-[#64748b]">
                  {offer.accountMaturity.replaceAll("_", " ")}
                </span>
              </div>

              <h3 className="mt-4 text-xl font-semibold text-[#0f172a]">
                {offer.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-[#526072]">{offer.body}</p>

              <ul className="mt-4 space-y-2">
                {offer.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2 text-sm text-[#334155]">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#0f766e]" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-xs uppercase tracking-[0.16em] text-[#64748b]">
                  Trigger: {offer.trigger.replaceAll("-", " ")}
                </p>
                {offer.cta.kind === "link" ? (
                  <Link
                    href={offer.cta.href as never}
                    onClick={() =>
                      sendUpsellEvent({
                        eventType: "click",
                        offer
                      })
                    }
                    className="inline-flex items-center justify-center rounded-full bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white"
                  >
                    {offer.cta.label}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                ) : (
                  <form action={offer.cta.action} method="post">
                    {offer.cta.kind === "checkout" ? (
                      <input type="hidden" name="planCode" value={offer.cta.planCode} />
                    ) : null}
                    <input
                      type="hidden"
                      name="source"
                      value={`upsell:${offer.placement}:${offer.key}`}
                    />
                    <button
                      type="submit"
                      onClick={() =>
                        sendUpsellEvent({
                          eventType: "click",
                          offer
                        })
                      }
                      className="inline-flex items-center justify-center rounded-full bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white"
                    >
                      {offer.cta.label}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </button>
                  </form>
                )}
              </div>

              <p className="mt-3 text-sm text-[#64748b]">{offer.cta.helperText}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
