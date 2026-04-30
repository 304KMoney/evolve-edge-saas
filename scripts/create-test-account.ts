/**
 * One-shot script to provision a test account for an engineer.
 * Run: cd apps/web && node_modules\.bin\tsx.cmd --require ./scripts/shims/server-only.js ../../scripts/create-test-account.ts
 */
import { loadEnvConfig } from "@next/env";
import path from "node:path";

loadEnvConfig(path.resolve(__dirname, "../apps/web"));

import { prisma, hashPassword } from "@evolve-edge/db";
import { randomBytes } from "node:crypto";

// --- config ---
const EMAIL = "harshay.buradkar@toptal.com";
const FIRST_NAME = "Harshay";
const LAST_NAME = "Buradkar";
const ORG_NAME = "Harshay Test Workspace";
const ORG_SLUG = "harshay-test";
const PLATFORM_ROLE = "OPERATOR"; // full admin console access
const ORG_ROLE = "OWNER";
// --- end config ---

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 16 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (existing) {
    console.log(`\n⚠️  User ${EMAIL} already exists (id: ${existing.id})`);
    console.log("To reset password: use /forgot-password in the app.\n");
    await prisma.$disconnect();
    return;
  }

  const tempPassword = generatePassword();
  const passwordHash = hashPassword(tempPassword);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: EMAIL,
        firstName: FIRST_NAME,
        lastName: LAST_NAME,
        platformRole: PLATFORM_ROLE as any,
        onboardingCompletedAt: new Date(),
        passwordCredential: {
          create: { passwordHash },
        },
      },
    });

    const org = await tx.organization.create({
      data: {
        name: ORG_NAME,
        slug: ORG_SLUG,
        createdByUserId: user.id,
        billingOwnerUserId: user.id,
        onboardingCompletedAt: new Date(),
      },
    });

    await tx.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: ORG_ROLE,
        isBillingAdmin: true,
      },
    });

    return { user, org };
  });

  console.log("\n✅ Test account created successfully\n");
  console.log("─────────────────────────────────────────");
  console.log(`  Email:         ${EMAIL}`);
  console.log(`  Password:      ${tempPassword}`);
  console.log(`  Org:           ${ORG_NAME} (slug: ${ORG_SLUG})`);
  console.log(`  Platform role: ${PLATFORM_ROLE}`);
  console.log(`  Org role:      ${ORG_ROLE}`);
  console.log(`  User ID:       ${result.user.id}`);
  console.log(`  Org ID:        ${result.org.id}`);
  console.log("─────────────────────────────────────────");
  console.log("\n⚠️  Share password via 1Password/vault ONLY — not chat or email.");
  console.log("   Harshay should change it after first login via /dashboard/settings\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
