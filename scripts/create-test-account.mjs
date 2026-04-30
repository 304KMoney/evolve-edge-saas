/**
 * One-shot script to provision a test account for an engineer.
 * Usage: node scripts/create-test-account.mjs
 * Run from repo root with DATABASE_URL set in .env.local
 */
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// --- config ---
const EMAIL = "harshay.buradkar@toptal.com";
const FIRST_NAME = "Harshay";
const LAST_NAME = "Buradkar";
const ORG_NAME = "Harshay Test Workspace";
const ORG_SLUG = "harshay-test";
// Platform role: OPERATOR gives admin console access for engineering review
const PLATFORM_ROLE = "OPERATOR";
const ORG_ROLE = "OWNER";
// --- end config ---

function hashPassword(password) {
  const SCRYPT_N = 16384;
  const SCRYPT_R = 8;
  const SCRYPT_P = 1;
  const KEY_LENGTH = 64;
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey}`;
}

function generatePassword() {
  // 16-char readable temp password
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 16 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

async function main() {
  // Load env
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd());

  const prisma = new PrismaClient();

  try {
    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
    if (existing) {
      console.log(`⚠️  User ${EMAIL} already exists (id: ${existing.id})`);
      console.log("To reset their password, use the forgot-password flow at /forgot-password");
      return;
    }

    const tempPassword = generatePassword();
    const passwordHash = hashPassword(tempPassword);

    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: EMAIL,
          firstName: FIRST_NAME,
          lastName: LAST_NAME,
          platformRole: PLATFORM_ROLE,
          onboardingCompletedAt: new Date(),
          passwordCredential: {
            create: { passwordHash },
          },
        },
      });

      // Create org
      const org = await tx.organization.create({
        data: {
          name: ORG_NAME,
          slug: ORG_SLUG,
          createdByUserId: user.id,
          billingOwnerUserId: user.id,
          onboardingCompletedAt: new Date(),
        },
      });

      // Add as owner member
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
    console.log(`  Email:        ${EMAIL}`);
    console.log(`  Password:     ${tempPassword}`);
    console.log(`  Org:          ${ORG_NAME} (${ORG_SLUG})`);
    console.log(`  Platform role: ${PLATFORM_ROLE} (admin console access)`);
    console.log(`  Org role:      ${ORG_ROLE}`);
    console.log(`  User ID:       ${result.user.id}`);
    console.log(`  Org ID:        ${result.org.id}`);
    console.log("─────────────────────────────────────────");
    console.log("\n⚠️  Share the password securely via vault/1Password — not over chat/email.");
    console.log("   Harshay should change it immediately after first login via /dashboard/settings\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
