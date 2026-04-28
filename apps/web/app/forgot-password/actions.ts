"use server";

import { createPasswordResetToken, sendPasswordResetEmail } from "../../lib/password-reset";

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    return;
  }

  try {
    const rawToken = await createPasswordResetToken(email);
    if (rawToken) {
      // fire and forget — always show success to avoid timing-based user enumeration
      sendPasswordResetEmail(email, rawToken).catch((err: unknown) => {
        console.error("[password-reset] Failed to send reset email:", err);
      });
    }
  } catch (err) {
    console.error("[password-reset] Error creating reset token:", err);
  }
}
