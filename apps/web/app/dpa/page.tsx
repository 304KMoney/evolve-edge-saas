import type { Metadata } from "next";
import { MarketingShell } from "../../components/marketing-shell";

export const metadata: Metadata = {
  title: "Data Processing Agreement | Evolve Edge",
  description: "Data Processing Agreement (DPA) for Evolve Edge AI."
};

export default function DpaPage() {
  return (
    <MarketingShell ctaHref="/pricing" ctaLabel="View Pricing">
      <div className="mx-auto max-w-3xl py-12">
        <div className="prose prose-slate max-w-none">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            Data Processing Agreement
          </h1>
          <p className="mt-2 text-sm text-steel">Last updated: April 29, 2026</p>
          <p className="mt-2 text-sm text-steel">
            To request an executed DPA for your organization, email{" "}
            <a href="mailto:kiel@evolveedge.ai?subject=DPA%20Request%20%E2%80%94%20Evolve%20Edge" className="text-accent">
              kiel@evolveedge.ai
            </a>{" "}
            with subject line &ldquo;DPA Request — Evolve Edge&rdquo;. UK and Canadian customers may also request Standard Contractual Clauses or IDTA addendums.
          </p>

          <p className="mt-6 text-sm leading-7 text-steel">
            This Data Processing Agreement (&ldquo;DPA&rdquo;) forms part of the agreement between
            the Customer and Evolve Edge AI (&ldquo;Evolve Edge&rdquo;) governing the Customer&rsquo;s
            use of the Evolve Edge platform and services (the &ldquo;Services&rdquo;). This DPA is
            incorporated by reference into the Evolve Edge{" "}
            <a href="/terms" className="text-accent">
              Terms of Service
            </a>
            .
          </p>

          {/* 1. Scope and Definitions */}
          <h2 className="mt-10 text-xl font-semibold text-ink">1. Scope and Definitions</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            This DPA applies to the processing of Personal Data by Evolve Edge on behalf of the
            Customer in connection with the delivery of the Services.
          </p>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-steel">
            <li>
              <strong>&ldquo;Personal Data&rdquo;</strong> means any information relating to an
              identified or identifiable natural person processed under this DPA.
            </li>
            <li>
              <strong>&ldquo;Processing&rdquo;</strong> means any operation performed on Personal
              Data, including collection, storage, use, disclosure, and deletion.
            </li>
            <li>
              <strong>&ldquo;Controller&rdquo;</strong> means the entity that determines the
              purposes and means of processing Personal Data.
            </li>
            <li>
              <strong>&ldquo;Processor&rdquo;</strong> means the entity that processes Personal
              Data on behalf of the Controller.
            </li>
            <li>
              <strong>&ldquo;Sub-processor&rdquo;</strong> means any third party engaged by Evolve
              Edge to assist in processing Personal Data.
            </li>
          </ul>

          {/* 2. Roles */}
          <h2 className="mt-10 text-xl font-semibold text-ink">2. Roles of the Parties</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            The Customer acts as the <strong>Controller</strong> of Personal Data processed in
            connection with the Services. Evolve Edge acts as the <strong>Processor</strong>,
            processing Personal Data solely on behalf of and under the documented instructions of
            the Customer.
          </p>

          {/* 3. Processing Purposes */}
          <h2 className="mt-10 text-xl font-semibold text-ink">3. Processing Purposes</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            Evolve Edge processes Personal Data solely to deliver the contracted Services,
            including:
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-7 text-steel">
            <li>Account management and authentication</li>
            <li>Compliance workflow execution and audit delivery</li>
            <li>AI risk assessments and evidence management</li>
            <li>Billing and subscription management</li>
            <li>Platform security and fraud prevention</li>
          </ul>
          <p className="mt-3 text-sm leading-7 text-steel">
            Evolve Edge will not process Personal Data for any other purpose without the
            Customer&rsquo;s prior written consent or as required by law.
          </p>

          {/* 4. Data Subjects and Categories */}
          <h2 className="mt-10 text-xl font-semibold text-ink">
            4. Data Subjects and Categories of Personal Data
          </h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            The categories of data subjects whose Personal Data may be processed include:
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-7 text-steel">
            <li>Customer&rsquo;s employees and authorized end users of the platform</li>
            <li>Customer&rsquo;s business contacts referenced in compliance workflows</li>
          </ul>
          <p className="mt-4 text-sm leading-7 text-steel">
            Categories of Personal Data that may be processed:
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-7 text-steel">
            <li>Identification data (name, email address, job title)</li>
            <li>Authentication credentials (hashed passwords, session tokens)</li>
            <li>Usage data and audit logs</li>
            <li>Compliance documentation and evidence files uploaded by the Customer</li>
          </ul>

          {/* 5. Security Measures */}
          <h2 className="mt-10 text-xl font-semibold text-ink">
            5. Technical and Organizational Security Measures
          </h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            Evolve Edge implements and maintains appropriate technical and organizational security
            measures, including:
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-7 text-steel">
            <li>Encryption in transit using TLS 1.2 or higher for all data transfers</li>
            <li>Encryption at rest for stored Personal Data</li>
            <li>Strong password hashing (one-way, salted)</li>
            <li>Comprehensive audit logging of data access and modifications</li>
            <li>Role-based access controls with principle of least privilege</li>
            <li>Regular security reviews and vulnerability management</li>
            <li>Incident detection and response procedures</li>
            <li>Employee security training and confidentiality obligations</li>
          </ul>

          {/* 6. Sub-processors */}
          <h2 className="mt-10 text-xl font-semibold text-ink">6. Sub-Processors</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            Evolve Edge engages the following sub-processors to assist in delivering the Services:
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
          <p className="mt-4 text-sm leading-7 text-steel">
            Evolve Edge will notify the Customer of any intended changes to this sub-processor list
            (additions or replacements) with at least 14 days&rsquo; notice, providing the Customer
            with the opportunity to object on reasonable grounds.
          </p>

          {/* 7. Data Subject Rights */}
          <h2 className="mt-10 text-xl font-semibold text-ink">7. Data Subject Rights</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            Evolve Edge will provide reasonable assistance to the Customer in fulfilling its
            obligations to respond to data subject rights requests (access, rectification,
            erasure, portability, restriction, and objection). Upon receipt of a data subject
            request, Evolve Edge will promptly notify the Customer and take technically feasible
            steps to assist in responding within applicable legal timeframes.
          </p>

          {/* 8. Data Breach Notification */}
          <h2 className="mt-10 text-xl font-semibold text-ink">8. Data Breach Notification</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            In the event of a confirmed Personal Data breach, Evolve Edge will notify the Customer
            without undue delay and in any event within 72 hours of becoming aware of the breach.
            Notification will include, to the extent known: the nature of the breach, the
            categories and approximate number of data subjects affected, the likely consequences,
            and the measures taken or proposed to address the breach. Evolve Edge will cooperate
            with the Customer in meeting any regulatory notification obligations.
          </p>

          {/* 9. International Transfers */}
          <h2 className="mt-10 text-xl font-semibold text-ink">9. International Data Transfers</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            Personal Data is primarily processed and stored in the United States. For transfers of
            Personal Data from the European Economic Area (EEA), United Kingdom, or Switzerland,
            Evolve Edge relies on the Standard Contractual Clauses (EU SCCs 2021) adopted by the
            European Commission as the lawful transfer mechanism. Customers requiring executed SCCs
            may contact us at{" "}
            <a href="mailto:kiel@evolveedge.ai" className="text-accent">
              kiel@evolveedge.ai
            </a>
            .
          </p>

          {/* 10. Return and Deletion */}
          <h2 className="mt-10 text-xl font-semibold text-ink">
            10. Return and Deletion of Data
          </h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            Upon termination of the Services, Evolve Edge will, at the Customer&rsquo;s election,
            return or securely delete Customer Personal Data within 30 days, unless retention is
            required by applicable law. Evolve Edge will provide written confirmation of deletion
            upon request.
          </p>

          {/* 11. Audit Rights */}
          <h2 className="mt-10 text-xl font-semibold text-ink">11. Audit Rights</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            Evolve Edge will make available to the Customer all information reasonably necessary to
            demonstrate compliance with this DPA and applicable data protection laws. Evolve Edge
            will cooperate with audits or inspections conducted by the Customer or an authorized
            third-party auditor, subject to reasonable advance notice and confidentiality
            obligations.
          </p>

          {/* 12. Contact */}
          <h2 className="mt-10 text-xl font-semibold text-ink">12. Contact</h2>
          <p className="mt-3 text-sm leading-7 text-steel">
            For questions about this DPA or to request executed Standard Contractual Clauses,
            please contact us at:{" "}
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
