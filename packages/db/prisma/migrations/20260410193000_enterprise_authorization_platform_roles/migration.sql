-- CreateEnum
CREATE TYPE "PlatformUserRole" AS ENUM ('NONE', 'SUPER_ADMIN', 'OPERATOR', 'REVIEWER', 'EXECUTIVE_ADMIN');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "platformRole" "PlatformUserRole" NOT NULL DEFAULT 'NONE';
