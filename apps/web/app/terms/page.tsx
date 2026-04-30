import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "../../components/marketing-shell";

export const metadata: Metadata = {
  title: "Terms of Service | Evolve Edge",
  description: "Terms of Service for Evolve Edge."
};

export default function TermsPage() {
  return (
    <MarketingShell ctaHref="/pricing" ctaLabel="View Pricing">
      <div className="mx-auto max-w-3xl py-12">
        <div className="prose prose-slate max-w-none">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Terms of Service</h1>
          <p className="mt-2 text-sm text-steel">Last updated: April 27, 2026</p>

          <p className="mt-6 text-sm leading-7 text-steel">
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the
            Evolve Edge platform (the &ldquo;Service&rdquo;) provided by Evolve Edge
            (&ldquo;Evolve Edge,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;). By accessing or using the Service, you agree to be bound by these
            Terms.
          </p>

          {/* 1. Service Description */}
          <h2 className="mt-10 text-xl font-semibold text-ink">1. Service Description</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            Evolve Edge provides an AI governance and compliance SaaS platform, including SOC 2
            readiness tooling, compliance audit delivery, AI risk scoring, evidence management,
            and executive reporting workflows. The Service is designed for organizations seeking to
            align to regulatory and industry frameworks including SOC 2, NIST AI RMF, and ISO
            27001.
          </p>

          {/* 2. Account Registration */}
          <h2 className="mt-10 text-xl font-semibold text-ink">2. Account Registration and Security</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            To access the Service, you must create an account with accurate and complete
            information. You are responsible for maintaining the confidentiality of your login
            credentials and for all activity that occurs under your account. You must notify us
            immediately at{" "}
            <a href="mailto:k.green@evolveedgeai.com" className="text-accent">
              k.green@evolveedgeai.com
            </a>{" "}
            of any unauthorized use of your account. We reserve the right to disable accounts that
            violate these Terms.
          </p>

          {/* 3. Acceptable Use */}
          <h2 className="mt-10 text-xl font-semibold text-ink">3. Acceptable Use Policy</h2>
          <p className="mt-3 text-sm leading-7 text-steel">You agree not to:</p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-7 text-steel">
            <li>Use the Service for any unlawful purpose or in violation of any regulations</li>
            <li>Attempt to gain unauthorized access to the Service or its related systems</li>
            <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
            <li>Upload malicious code, viruses, or harmful content</li>
            <li>Use the Service to harm, harass, or impersonate any person or entity</li>
            <li>
              Resell, sublicense, or otherwise transfer access to the Service without our prior
              written consent
            </li>
            <li>
              Interfere with or disrupt the integrity or performance of the Service
            </li>
          </ul>

          {/* 4. Subscriptions */}
          <h2 className="mt-10 text-xl font-semibold text-ink">
            4. Subscription and Payment Terms
          </h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            Access to the Service is provided on a subscription basis (monthly or annual) billed
            via Stripe. By subscribing, you authorize us to charge your payment method for all
            applicable fees. Subscriptions renew automatically unless cancelled before the renewal
            date. All fees are non-refundable except as required by applicable law. We reserve the
            right to change pricing with at least 30 days&rsquo; notice. Failure to pay may result
            in suspension or termination of your account.
          </p>

          {/* 5. Data Ownership */}
          <h2 className="mt-10 text-xl font-semibold text-ink">5. Data Ownership</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            You retain full ownership of all data, content, and evidence files you upload or
            create through the Service (&ldquo;Customer Data&rdquo;). You grant Evolve Edge a
            limited, non-exclusive license to process Customer Data solely as necessary to provide
            and improve the Service. We do not sell Customer Data to third parties. Our use of
            Customer Data is further described in our{" "}
            <Link href={"/privacy" as never} className="text-accent">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href={"/dpa" as never} className="text-accent">
              Data Processing Agreement
            </Link>
            .
          </p>

          {/* 6. Intellectual Property */}
          <h2 className="mt-10 text-xl font-semibold text-ink">6. Intellectual Property</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            Evolve Edge and its licensors retain all rights, title, and interest in and to the
            Service, including all software, algorithms, user interfaces, documentation, and
            related materials. Nothing in these Terms transfers any ownership rights in the Service
            to you. You may provide us feedback about the Service, and you grant us a perpetual,
            royalty-free license to use that feedback to improve the Service.
          </p>

          {/* 7. Service Availability */}
          <h2 className="mt-10 text-xl font-semibold text-ink">7. Service Availability</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            We will use commercially reasonable efforts to maintain the availability of the
            Service. The Service may be temporarily unavailable due to scheduled maintenance,
            emergency patches, or events outside our reasonable control. We will endeavor to
            provide advance notice of planned maintenance windows where practicable. We do not
            guarantee uninterrupted, error-free service.
          </p>

          {/* 8. Limitation of Liability */}
          <h2 className="mt-10 text-xl font-semibold text-ink">8. Limitation of Liability</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, EVOLVE EDGE SHALL NOT BE LIABLE
            FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING
            LOSS OF PROFITS, DATA, GOODWILL, OR BUSINESS INTERRUPTION, ARISING OUT OF OR RELATED
            TO THESE TERMS OR YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
            DAMAGES. OUR TOTAL LIABILITY TO YOU FOR ANY CLAIMS ARISING UNDER THESE TERMS SHALL NOT
            EXCEED THE AGGREGATE FEES PAID BY YOU TO EVOLVE EDGE IN THE TWELVE (12) MONTHS
            PRECEDING THE CLAIM.
          </p>

          {/* 9. Indemnification */}
          <h2 className="mt-10 text-xl font-semibold text-ink">9. Indemnification</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            You agree to indemnify, defend, and hold harmless Evolve Edge and its officers,
            directors, employees, and agents from and against any claims, liabilities, damages,
            losses, and expenses (including reasonable legal fees) arising out of or related to
            your use of the Service, your violation of these Terms, or your violation of any rights
            of a third party.
          </p>

          {/* 10. Termination */}
          <h2 className="mt-10 text-xl font-semibold text-ink">10. Termination</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            Either party may terminate these Terms and your access to the Service with 30
            days&rsquo; written notice for any reason other than a material breach. We may
            terminate or suspend your access immediately if you materially breach these Terms. Upon
            termination, your right to access the Service ceases. You may request an export of
            your Customer Data within 30 days of termination; after that period, we may delete
            your data in accordance with our data retention policy.
          </p>

          {/* 11. Governing Law */}
          <h2 className="mt-10 text-xl font-semibold text-ink">11. Governing Law</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            These Terms shall be governed by and construed in accordance with the laws of the State
            of Delaware, without regard to its conflict of laws principles. Any disputes arising
            under these Terms shall be subject to the exclusive jurisdiction of the state and
            federal courts located in Delaware.
          </p>

          {/* 12. Changes */}
          <h2 className="mt-10 text-xl font-semibold text-ink">12. Changes to These Terms</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            We may update these Terms from time to time. We will notify you of material changes
            by posting the new Terms on this page and updating the &ldquo;Last updated&rdquo; date.
            Your continued use of the Service after such changes constitutes acceptance of the
            updated Terms.
          </p>

          {/* 13. Contact */}
          <h2 className="mt-10 text-xl font-semibold text-ink">13. Contact</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            If you have questions about these Terms, please contact us at{" "}
            <a href="mailto:k.green@evolveedgeai.com" className="text-accent">
              k.green@evolveedgeai.com
            </a>
            .
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
