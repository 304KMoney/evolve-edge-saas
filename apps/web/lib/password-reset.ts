import { createHash, randomBytes } from "node:crypto";
import { hashPassword, prisma } from "@evolve-edge/db";
import { Resend } from "resend";
import { getAppUrl, getOptionalEnv } from "./runtime-config";

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates a password reset token for the given email address.
 * Returns the raw token (to be sent to the user) or null if the user does not exist.
 * Never reveals whether the user was found — that's the caller's responsibility.
 */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    select: { id: true }
  });

  if (!user) {
    return null;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Delete any existing tokens for this user before creating a new one
  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id }
  });

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt
    }
  });

  return rawToken;
}

/**
 * Sends a password reset email via Resend.
 * Only sends if RESEND_API_KEY is configured; otherwise logs a warning.
 */
export async function sendPasswordResetEmail(toEmail: string, token: string): Promise<void> {
  const apiKey = getOptionalEnv("RESEND_API_KEY");

  if (!apiKey) {
    console.warn(
      "[password-reset] RESEND_API_KEY is not set. Skipping password reset email send."
    );
    return;
  }

  const resetUrl = `${getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: "Evolve Edge <k.green@evolveedgeai.com>",
    to: [toEmail],
    subject: "Reset your Evolve Edge password",
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #05111d;">Reset your password</h2>
        <p style="color: #374151; line-height: 1.6;">
          We received a request to reset the password for your Evolve Edge account.
          Click the button below to choose a new password.
        </p>
        <p style="margin: 32px 0;">
          <a
            href="${resetUrl}"
            style="
              display: inline-block;
              background: #1cc7d8;
              color: #05111d;
              font-weight: 600;
              text-decoration: none;
              padding: 12px 24px;
              border-radius: 9999px;
            "
          >
            Reset password
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          This link expires in 1 hour. If you did not request a password reset, you can safely
          ignore this email — your password will not be changed.
        </p>
        <p style="color: #6b7280; font-size: 12px;">
          If the button above does not work, copy and paste this URL into your browser:<br />
          <span style="word-break: break-all;">${resetUrl}</span>
        </p>
      </div>
    `
  });
}

/**
 * Verifies a raw reset token and marks it as used.
 * Returns the userId if valid, or null if the token is invalid or expired.
 */
export async function verifyAndConsumePasswordResetToken(rawToken: string): Promise<string | null> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash }
  });

  if (!record) {
    return null;
  }

  if (record.usedAt !== null) {
    return null;
  }

  if (record.expiresAt <= now) {
    return null;
  }

  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: now }
  });

  return record.userId;
}

/**
 * Hashes and updates the user's password in the database.
 */
export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = hashPassword(newPassword);

  await prisma.passwordCredential.upsert({
    where: { userId },
    update: {
      passwordHash,
      passwordUpdatedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null
    },
    create: {
      userId,
      passwordHash
    }
  });
}
