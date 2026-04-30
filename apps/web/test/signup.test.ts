import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignupForm } from "../app/signup/signup-form";
import { getPostAuthRedirectPath } from "../lib/auth";
import {
  createPasswordSignupAccount,
  getSignupErrorMessage,
  getSignupSuccessRedirectPath,
  validateSignupInput
} from "../lib/signup";

function createSignupDb(existingUser: { id: string } | null = null) {
  const calls = {
    createdEmail: "",
    passwordHash: ""
  };

  return {
    calls,
    db: {
      user: {
        async findUnique() {
          return existingUser;
        },
        async create(args: {
          data: {
            email: string;
            firstName: string;
            lastName: string;
            passwordCredential: { create: { passwordHash: string } };
          };
        }) {
          calls.createdEmail = args.data.email;
          calls.passwordHash = args.data.passwordCredential.create.passwordHash;

          return {
            id: "user_signup",
            email: args.data.email,
            firstName: args.data.firstName,
            lastName: args.data.lastName,
            platformRole: "NONE",
            authProviderId: null,
            hubspotContactId: null,
            onboardingCompletedAt: null,
            createdAt: new Date("2026-04-29T00:00:00.000Z"),
            updatedAt: new Date("2026-04-29T00:00:00.000Z")
          };
        }
      }
    }
  };
}

async function runSignupTests() {
  const renderedForm = renderToStaticMarkup(
    React.createElement(SignupForm, {
      errorMessage: getSignupErrorMessage("weak_password"),
      defaultEmail: "owner@example.com",
      defaultName: "Primary Owner",
      defaultCompanyName: "Evolve Edge",
      redirectTo: "/onboarding?plan=starter"
    })
  );

  assert.match(renderedForm, /Create your account/);
  assert.match(renderedForm, /Create Account/);
  assert.match(renderedForm, /Already have an account\? Sign in/);
  assert.match(
    renderedForm,
    /\/sign-in\?redirectTo=%2Fonboarding%3Fplan%3Dstarter/
  );
  assert.match(renderedForm, /name="companyName"/);
  assert.match(renderedForm, /Use a password with at least 10 characters/);

  const validation = validateSignupInput({
    name: "  Primary Owner ",
    email: " OWNER@Example.COM ",
    password: "safe-password",
    companyName: " Evolve Edge "
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.ok ? validation.data.email : "", "owner@example.com");
  assert.equal(validation.ok ? validation.data.firstName : "", "Primary");
  assert.equal(validation.ok ? validation.data.lastName : "", "Owner");
  assert.equal(validation.ok ? validation.data.companyName : "", "Evolve Edge");

  const invalidEmail = validateSignupInput({
    name: "Primary Owner",
    email: "not-an-email",
    password: "safe-password"
  });
  assert.deepEqual(invalidEmail, { ok: false, error: "invalid_email" });

  const weakPassword = validateSignupInput({
    name: "Primary Owner",
    email: "owner@example.com",
    password: "short"
  });
  assert.deepEqual(weakPassword, { ok: false, error: "weak_password" });

  if (!validation.ok) {
    throw new Error("Expected valid signup input.");
  }

  const success = createSignupDb();
  const created = await createPasswordSignupAccount(validation.data, success.db as never);
  assert.equal(created.ok, true);
  assert.equal(success.calls.createdEmail, "owner@example.com");
  assert.match(success.calls.passwordHash, /^scrypt\$/);
  assert.doesNotMatch(success.calls.passwordHash, /safe-password/);

  const duplicate = createSignupDb({ id: "existing_user" });
  const duplicateResult = await createPasswordSignupAccount(validation.data, duplicate.db as never);
  assert.deepEqual(duplicateResult, { ok: false, error: "duplicate" });

  assert.equal(
    getPostAuthRedirectPath({ membershipCount: 0 }),
    "/onboarding",
    "New users without an organization should finish onboarding before dashboard access."
  );
  assert.equal(
    getPostAuthRedirectPath({ membershipCount: 1 }),
    "/dashboard",
    "Existing organization members should enter the dashboard."
  );
  assert.equal(
    getSignupSuccessRedirectPath({ membershipCount: 0 }),
    "/onboarding"
  );
  assert.equal(
    getSignupSuccessRedirectPath({ membershipCount: 1 }),
    "/dashboard"
  );

  console.log("signup tests passed");
}

void runSignupTests();
