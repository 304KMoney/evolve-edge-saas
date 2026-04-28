"use server";

import { redirect } from "next/navigation";
import { verifyAndConsumePasswordResetToken, resetUserPassword } from "../../lib/password-reset";

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  const newPassword = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) {
    redirect("/forgot-password");
  }

  if (!newPassword || newPassword !== confirmPassword || newPassword.length < 8) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=invalid_password`);
  }

  const userId = await verifyAndConsumePasswordResetToken(token);

  if (!userId) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=invalid_token`);
  }

  await resetUserPassword(userId, newPassword);
  redirect("/sign-in?reset=success");
}
