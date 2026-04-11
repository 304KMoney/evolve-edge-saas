import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, BadgeCheck, BookOpenText, LockKeyhole, ShieldCheck } from "lucide-react";

function getIcon(index: number) {
  if (index % 4 === 0) {
    return ShieldCheck;
  }

  if (index % 4 === 1) {
    return BadgeCheck;
  }

  if (index % 4 === 2) {
    return LockKeyhole;
  }

  return BookOpenText;
}

export function AuthorityPageShell(props: {
  eyebrow: string;
  title: string;
  body: string;
  children: React.ReactNode;
  primaryCta?: {
    href: Route;
    label: string;
  };
  secondaryCta?: {
    href: Route;
    label: string;
  };
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(153,246,228,0.45),transparent_28%),linear-gradient(180deg,#f7fbfc_0%,#edf5f7_100%)]">
      <section className="mx-auto max-w-7xl px-6 py-8 md:py-12">
        <div className="rounded-[32px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,245,249,0.92))] p-6 shadow-[0_24px_90px_rgba(15,23,42,0.08)] md:p-10">
          <div className="flex flex-col gap-6 border-b border-[#dbe7ea] pb-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#0f766e]">
                {props.eyebrow}
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#0f172a] md:text-5xl">
                {props.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#475569]">
                {props.body}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {props.primaryCta ? (
                <Link
                  href={props.primaryCta.href}
                  className="inline-flex items-center rounded-full bg-[#0f766e] px-5 py-3 text-sm font-semibold text-white"
                >
                  {props.primaryCta.label}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              ) : null}
              {props.secondaryCta ? (
                <Link
                  href={props.secondaryCta.href}
                  className="inline-flex items-center rounded-full border border-[#d6e6e8] bg-white px-5 py-3 text-sm font-semibold text-[#0f172a]"
                >
                  {props.secondaryCta.label}
                </Link>
              ) : null}
            </div>
          </div>
          <div className="mt-8">{props.children}</div>
        </div>
      </section>
    </main>
  );
}

export function AuthoritySection(props: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-semibold text-[#0f172a]">{props.title}</h2>
      {props.description ? (
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#64748b]">{props.description}</p>
      ) : null}
      <div className="mt-5">{props.children}</div>
    </section>
  );
}

export function AuthorityCardGrid(props: {
  items: Array<{
    title: string;
    body: string;
    eyebrow?: string;
    href?: Route;
    footer?: string;
  }>;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {props.items.map((item, index) => {
        const Icon = getIcon(index);

        return (
          <article
            key={item.title}
            className="rounded-[28px] border border-white/75 bg-white/90 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.05)]"
          >
            <Icon className="h-6 w-6 text-[#0f766e]" />
            {item.eyebrow ? (
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#64748b]">
                {item.eyebrow}
              </p>
            ) : null}
            <h3 className="mt-3 text-xl font-semibold text-[#0f172a]">{item.title}</h3>
            <p className="mt-3 text-sm leading-7 text-[#475569]">{item.body}</p>
            {item.footer ? (
              <p className="mt-4 text-xs uppercase tracking-[0.2em] text-[#94a3b8]">{item.footer}</p>
            ) : null}
            {item.href ? (
              <Link
                href={item.href}
                className="mt-5 inline-flex items-center text-sm font-semibold text-[#0f766e]"
              >
                Explore
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function AuthorityListCard(props: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-[28px] border border-white/75 bg-white/90 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.05)]">
      <h3 className="text-xl font-semibold text-[#0f172a]">{props.title}</h3>
      <ul className="mt-4 space-y-3 text-sm leading-7 text-[#475569]">
        {props.items.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <span className="mt-2 inline-block h-2 w-2 rounded-full bg-[#0f766e]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AuthorityFaq(props: {
  items: readonly {
    question: string;
    answer: string;
  }[];
}) {
  return (
    <div className="space-y-4">
      {props.items.map((item) => (
        <article key={item.question} className="rounded-[28px] border border-white/75 bg-white/90 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.05)]">
          <h3 className="text-lg font-semibold text-[#0f172a]">{item.question}</h3>
          <p className="mt-3 text-sm leading-7 text-[#475569]">{item.answer}</p>
        </article>
      ))}
    </div>
  );
}
