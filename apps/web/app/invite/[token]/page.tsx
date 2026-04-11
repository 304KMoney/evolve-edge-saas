import Link from "next/link";
import { InviteStatus, hashOpaqueToken, prisma } from "@evolve-edge/db";
import { getCurrentSession } from "../../../lib/auth";
import { acceptInviteAction } from "./actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const session = await getCurrentSession();

  if (!session.organization && session.authMode === "password" && !session.onboardingRequired) {
    redirect("/dashboard");
  }

  const invite = await prisma.organizationInvite.findFirst({
    where: {
      tokenHash: hashOpaqueToken(token)
    },
    include: {
      organization: true
    }
  });

  const inviteInvalid =
    !invite ||
    invite.status !== InviteStatus.PENDING ||
    invite.expiresAt <= new Date();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-10">
      <div className="w-full rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-panel backdrop-blur md:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
          Workspace Invitation
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">
          Join an Evolve Edge organization
        </h1>

        {inviteInvalid ? (
          <p className="mt-4 text-sm leading-7 text-steel">
            This invitation is no longer valid. Ask your workspace owner for a
            fresh invite.
          </p>
        ) : (
          <p className="mt-4 text-sm leading-7 text-steel">
            You&apos;ve been invited to join <strong>{invite.organization.name}</strong> as{" "}
            <strong>{invite.role}</strong>.
          </p>
        )}

        {query.error === "email" ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
            Sign in with the invited email address before accepting this invite.
          </div>
        ) : null}

        {query.error === "invalid" ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
            This invite was expired, revoked, or already accepted.
          </div>
        ) : null}

        {!inviteInvalid ? (
          <form action={acceptInviteAction.bind(null, token)} className="mt-8">
            <button
              type="submit"
              className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white"
            >
              Accept invitation
            </button>
          </form>
        ) : null}

        <div className="mt-6 text-sm text-steel">
          <Link href="/sign-in" className="font-semibold text-accent">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
