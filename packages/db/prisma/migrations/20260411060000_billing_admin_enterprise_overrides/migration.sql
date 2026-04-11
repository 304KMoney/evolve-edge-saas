-- AlterTable
ALTER TABLE "OrganizationInvite"
ADD COLUMN "isBillingAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrganizationMember"
ADD COLUMN "isBillingAdmin" BOOLEAN NOT NULL DEFAULT false;
