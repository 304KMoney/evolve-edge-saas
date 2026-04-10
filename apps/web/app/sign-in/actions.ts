"use server";

import {
  AUTH_SESSION_COOKIE,
  createSessionToken,
  getPasswordAuthConfig,
  isPasswordAuthEnabled,
  validatePasswordCredentials
} from "../../lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function buildCookieSettings() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  };
}

export async function signInAction(formData: FormData) {
  if (!isPasswordAuthEnabled()) {
    redirect("/dashboard");
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const authConfig = getPasswordAuthConfig();

  if (!authConfig.isComplete) {
    redirect("/sign-in?error=config");
  }

  if (!validatePasswordCredentials(email, password)) {
    redirect("/sign-in?error=invalid");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    AUTH_SESSION_COOKIE,
    createSessionToken(email),
    buildCookieSettings()
  );

  redirect("/dashboard");
}
