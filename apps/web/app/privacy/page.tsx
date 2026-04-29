import type { Metadata } from "next";
import { MarketingShell } from "../../components/marketing-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | Evolve Edge",
  description: "Privacy Policy for Evolve Edge — covering US, Canada (PIPEDA), and United Kingdom (UK GDPR) residents."
};

export default function PrivacyPage() {
  return (
    <MarketingShell ctaHref="/pricing" ctaLabel="View Pricing">
      <div className="mx-auto max-w-3xl py-12">
        <div className="prose prose-slate max-w-none">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Privacy Policy</h1>
          <p className="mt-2 text-sm text-steel">Last updated: April 29, 2026</p>
          <p className="mt-2 text-sm text-steel">
            Covers residents in the United States, Canada (PIPEDA &amp; Quebec Law 25), and United Kingdom (UK GDPR).{" "}
            <a href="mailto:kiel@evolveedge.ai" className="text-accent">Contact us</a> to request our Data Processing Agreement (DPA).
          </p>

          <p className="mt-6 text-sm leading-7 text-steel">
            Evolve Edge AI (&ldquo;Evolve Edge,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;) is committed to protecting your privacy. This Privacy Policy
            describes how we collect, use, and share information when you use our platform and
            services.
          </p>

          {/* 1. Information We Collect */}
          <h2 className="mt-10 text-xl font-semibold text-ink">1. Information We Collect</h2>
          <p className="mt-3 text-sm leading-7 text-steel">We collect the following categories of information:</p>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-steel">
            <li>
              <strong>Account data:</strong> Your name, email address, organization name, and
              credentials when you create an account.
            </li>
            <li>
              <strong>Usage and analytics data:</strong> Pages visited, features used, session
              duration, and interaction events within the platform.
            </li>
            <li>
              <strong>Evidence files and audit data:</strong> Documents, assessments, control
              evidence, and audit logs that you upload or generate within the platform.
            </li>
            <li>
              <strong>Billing information:</strong> Payment method details and transaction history
              processed by our payment provider, Stripe. We do not store full card numbers.
            </li>
            <li>
              <strong>Communications:</strong> Messages you send us via email or contact forms.
            </li>
          </ul>

          {/* 2. How We Use Information */}
          <h2 className="mt-10 text-xl font-semibold text-ink">2. How We Use Your Information</h2>
          <p className="mt-3 text-sm leading-7 text-steel">We use the information we collect to:</p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-7 text-steel">
            <li>Provide, operate, and maintain the Service</li>
            <li>Process billing and manage your subscription</li>
            <li>Power compliance workflows, AI risk assessments, and audit delivery</li>
            <li>Send transactional emails (account setup, report delivery, renewal reminders)</li>
            <li>Improve and develop the platform through aggregate, anonymized analytics</li>
            <li>Comply with legal obligations and enforce our Terms of Service</li>
          </ul>
          <p className="mt-3 text-sm leading-7 text-steel">
            We do not use your Customer Data to train third-party AI models, and we do not sell
            your personal information to third parties.
          </p>

          {/* 3. Sub-processors */}
          <h2 className="mt-10 text-xl font-semibold text-ink">3. Third-Party Sub-Processors</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            We share data with the following sub-processors to operate the Service:
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm text-steel">
              <thead>
                <tr className="border-b border-line">
                  <th className="pb-2 text-left font-semibold text-ink">Sub-processor</th>
                  <th className="pb-2 text-left font-semibold text-ink">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr>
                  <td className="py-2 pr-4">Stripe</td>
                  <td className="py-2">Payment processing and billing management</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Resend</td>
                  <td className="py-2">Transactional email delivery</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">n8n</td>
                  <td className="py-2">Workflow automation and audit delivery</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">HubSpot</td>
                  <td className="py-2">CRM and lead management</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">OpenAI</td>
                  <td className="py-2">AI processing for assessments and reports</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Neon</td>
                  <td className="py-2">Database hosting (Postgres)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Vercel</td>
                  <td className="py-2">Application hosting and CDN</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 4. Data Retention */}
          <h2 className="mt-10 text-xl font-semibold text-ink">4. Data Retention</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            We retain your account and usage data for as long as your account is active or as
            needed to provide the Service. Compliance evidence files and audit reports are retained
            according to your organization&rsquo;s configured retention policy. The default
            retention period for compliance data is 7 years, consistent with typical regulatory
            requirements for SOC 2 and related frameworks. You may request deletion of your data
            by contacting us (see Section 7).
          </p>

          {/* 5. Security */}
          <h2 className="mt-10 text-xl font-semibold text-ink">5. Security</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            We implement appropriate technical and organizational security measures to protect your
            information, including:
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-7 text-steel">
            <li>Encryption in transit using TLS for all data transfers</li>
            <li>Password hashing using strong one-way hash algorithms</li>
            <li>Comprehensive audit logging of access and changes</li>
            <li>Role-based access controls limiting data access to authorized personnel</li>
            <li>Regular security reviews and vulnerability assessments</li>
          </ul>

          {/* 6. Cookies */}
          <h2 className="mt-10 text-xl font-semibold text-ink">6. Cookies</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            We use session cookies to authenticate your session and maintain your signed-in state.
            We do not use third-party tracking or advertising cookies. Session cookies are deleted
            when you sign out or when your browser session ends.
          </p>

          {/* 7. Your Rights */}
          <h2 className="mt-10 text-xl font-semibold text-ink">7. Your Rights</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            Depending on your location, you may have the right to:
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-7 text-steel">
            <li>Access the personal data we hold about you</li>
            <li>Correct inaccurate personal data</li>
            <li>Request deletion of your personal data</li>
            <li>Export your data in a portable format</li>
            <li>Object to or restrict certain processing</li>
          </ul>
          <p className="mt-3 text-sm leading-7 text-steel">
            To exercise any of these rights, please contact us at{" "}
            <a href="mailto:kiel@evolveedge.ai" className="text-accent">
              kiel@evolveedge.ai
            </a>
            . We will respond within 30 days.
          </p>

          {/* 8. Changes */}
          <h2 className="mt-10 text-xl font-semibold text-ink">8. Changes to This Policy</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            We may update this Privacy Policy from time to time. We will notify you of material
            changes by posting the updated policy on this page. Your continued use of the Service
            after changes are posted constitutes your acceptance of the updated policy.
          </p>

          {/* 9. Contact */}
          <h2 className="mt-10 text-xl font-semibold text-ink">9. Contact</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            If you have questions or concerns about this Privacy Policy, please contact us at:{" "}
            <a href="mailto:kiel@evolveedge.ai" className="text-accent">
              kiel@evolveedge.ai
            </a>
            .
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
