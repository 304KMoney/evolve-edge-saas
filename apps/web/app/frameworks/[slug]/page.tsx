import Image from "next/image";
import type { Metadata } from "next";
import type { Route } from "next";
import { notFound } from "next/navigation";
import {
  AuthorityListCard,
  AuthorityPageShell,
  AuthoritySection
} from "../../../components/authority-sections";
import { PageAnalyticsTracker } from "../../../components/page-analytics-tracker";
import { FRAMEWORK_COVERAGE_ENTRIES } from "../../../lib/authority-content";
import { getFrameworkCoverageEntryBySlug } from "../../../lib/authority";

export function generateStaticParams() {
  return FRAMEWORK_COVERAGE_ENTRIES.map((framework) => ({ slug: framework.slug }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const framework = getFrameworkCoverageEntryBySlug(slug);

  if (!framework) {
    return {
      title: "Framework Coverage | Evolve Edge"
    };
  }

  return {
    title: `${framework.name} | Evolve Edge`,
    description: framework.overview
  };
}

export default async function FrameworkCoverageDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const framework = getFrameworkCoverageEntryBySlug(slug);

  if (!framework) {
    notFound();
  }

  return (
    <>
      <PageAnalyticsTracker
        eventName="marketing.framework_page_viewed"
        payload={{ slug: framework.slug, location: "framework-detail" }}
        source={`framework-${framework.slug}`}
        storageKey={`analytics:framework-${framework.slug}`}
      />
      <AuthorityPageShell
        eyebrow={framework.code}
        title={framework.name}
        body={framework.overview}
        primaryCta={{ href: "/contact-sales?intent=framework-review&source=framework-page" as Route, label: "Discuss your program" }}
        secondaryCta={{ href: "/frameworks" as Route, label: "All frameworks" }}
      >
        {framework.featuredAsset ? (
          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[28px] border border-white/75 bg-[#0f172a] p-6 shadow-[0_20px_70px_rgba(15,23,42,0.05)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#67e8f9]">
                {framework.featuredAsset.eyebrow}
              </p>
              <h2 className="mt-4 text-3xl font-semibold text-white">
                {framework.featuredAsset.title}
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                {framework.featuredAsset.body}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {framework.featuredAsset.stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-2xl font-semibold text-white">{stat.value}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-300">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-[28px] border border-white/75 bg-white/90 shadow-[0_20px_70px_rgba(15,23,42,0.05)]">
              <Image
                src={framework.featuredAsset.imagePath}
                alt={framework.featuredAsset.imageAlt}
                width={1400}
                height={900}
                className="h-full w-full object-cover"
                priority
              />
            </div>
          </section>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-4">
          <AuthorityListCard title="Buyer fit" items={framework.buyerFit} />
          <AuthorityListCard title="Coverage areas" items={framework.coverageAreas} />
          <AuthorityListCard title="Executive questions" items={framework.executiveQuestions} />
          <AuthorityListCard title="Monitoring signals" items={framework.monitoringSignals} />
        </div>

        <AuthoritySection
          title="Executive output expectations"
          description="Framework detail pages explain what a premium buyer should expect from delivery, not inflated promises about certification or legal outcomes."
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <AuthorityListCard title="Report outputs" items={framework.reportOutputs} />
            <AuthorityListCard
              title="Why this page exists"
              items={[
                "Support buyer education before the first sales call",
                "Give founders a consistent structure for future framework pages",
                "Make it easy to add deeper proof and downloadable assets later"
              ]}
            />
          </div>
        </AuthoritySection>

        {framework.assetDownloads?.length ? (
          <AuthoritySection
            title="Downloadable SOC 2 assets"
            description="These website-ready assets give the SOC 2 page more than copy alone. They support buyer education, founder conversations, and follow-up security review without overstating assurance."
          >
            <div className="grid gap-5 lg:grid-cols-2">
              {framework.assetDownloads.map((asset) => (
                <article
                  key={asset.href}
                  className="rounded-[28px] border border-white/75 bg-white/90 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.05)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0f766e]">
                    {asset.formatLabel}
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold text-[#0f172a]">
                    {asset.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[#475569]">{asset.summary}</p>
                  <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[#94a3b8]">
                    Audience: {asset.audience}
                  </p>
                  <a
                    href={asset.href}
                    className="mt-5 inline-flex items-center rounded-full bg-[#0f766e] px-5 py-3 text-sm font-semibold text-white"
                  >
                    Open asset
                  </a>
                </article>
              ))}
            </div>
          </AuthoritySection>
        ) : null}
      </AuthorityPageShell>
    </>
  );
}
