"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Sparkles, X } from "lucide-react";
import type { ActivationSnapshot } from "../lib/activation";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ActivationGuide({
  activation,
  organizationId,
  dismissible = true,
  compact = false
}: {
  activation: ActivationSnapshot;
  organizationId: string;
  dismissible?: boolean;
  compact?: boolean;
}) {
  const storageKey = `evolve-edge-activation-guide:${organizationId}`;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!dismissible) {
      return;
    }

    try {
      setDismissed(window.localStorage.getItem(storageKey) === "dismissed");
    } catch {
      setDismissed(false);
    }
  }, [dismissible, storageKey]);

  if (dismissed) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-[#d7eaeb] bg-[linear-gradient(180deg,#fbfefe_0%,#f1f8f7_100%)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#0f766e]">
            Activation progress
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#0f172a]">
            {activation.isActivated
              ? "First value reached"
              : "Reach first value faster"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#526072]">
            {activation.activationMilestone.rationale}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] shadow-sm">
            {activation.completionPercent}% complete
          </div>
          {dismissible ? (
            <button
              type="button"
              onClick={() => {
                try {
                  window.localStorage.setItem(storageKey, "dismissed");
                } catch {}
                setDismissed(true);
              }}
              className="rounded-full border border-[#d7eaeb] bg-white p-2 text-[#64748b]"
              aria-label="Dismiss activation guide"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className={cn("mt-5 grid gap-4", compact ? "lg:grid-cols-1" : "lg:grid-cols-[1.2fr_0.8fr]")}>
        <div className="space-y-3">
          {activation.steps.map((step, index) => (
            <div
              key={step.key}
              className={cn(
                "rounded-2xl border p-4",
                step.completed
                  ? "border-emerald-200 bg-white"
                  : "border-[#d7eaeb] bg-white"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[#64748b]">
                    Step {index + 1}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[#0f172a]">
                    {step.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#526072]">
                    {step.description}
                  </p>
                </div>
                {step.completed ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#0f766e]">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Complete
                  </span>
                ) : null}
              </div>
              {!step.completed ? (
                <Link
                  href={step.href as never}
                  className="mt-4 inline-flex items-center text-sm font-semibold text-[#0f766e]"
                >
                  {step.ctaLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              ) : null}
            </div>
          ))}
        </div>

        {!compact ? (
          <div className="rounded-[24px] bg-[#0f172a] p-5 text-white">
            <p className="text-xs uppercase tracking-[0.22em] text-[#99f6e4]">
              Next move
            </p>
            <h3 className="mt-3 text-2xl font-semibold">
              {activation.nextAction.title}
            </h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              {activation.nextAction.body}
            </p>
            <Link
              href={activation.nextAction.href as never}
              className="mt-5 inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0f172a]"
            >
              {activation.nextAction.label}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>

            <div className="mt-6 space-y-3">
              {activation.supportingSignals.map((signal) => (
                <div
                  key={signal.key}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{signal.label}</p>
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                        signal.completed
                          ? "bg-emerald-100 text-[#0f766e]"
                          : "bg-white/10 text-slate-300"
                      )}
                    >
                      {signal.completed ? "Live" : "Pending"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {signal.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {compact ? (
        <div className="mt-4 rounded-2xl border border-[#d7eaeb] bg-white p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[#64748b]">
            Next move
          </p>
          <p className="mt-2 text-sm leading-6 text-[#0f172a]">
            {activation.nextAction.body}
          </p>
          <Link
            href={activation.nextAction.href as never}
            className="mt-3 inline-flex items-center text-sm font-semibold text-[#0f766e]"
          >
            {activation.nextAction.label}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}

export function ActivationTipCard({
  title,
  body,
  href,
  label
}: {
  title: string;
  body: string;
  href: string;
  label: string;
}) {
  return (
    <div className="rounded-[24px] border border-[#d7eaeb] bg-[linear-gradient(180deg,#fbfefe_0%,#f5fbfa_100%)] p-5">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 text-[#0f766e]" />
        <div>
          <p className="text-lg font-semibold text-[#0f172a]">{title}</p>
          <p className="mt-2 text-sm leading-7 text-[#526072]">{body}</p>
          <Link
            href={href as never}
            className="mt-4 inline-flex items-center text-sm font-semibold text-[#0f766e]"
          >
            {label}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
