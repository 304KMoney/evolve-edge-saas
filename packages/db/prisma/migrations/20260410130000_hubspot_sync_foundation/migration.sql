ALTER TABLE "User"
ADD COLUMN "hubspotContactId" TEXT;

ALTER TABLE "Organization"
ADD COLUMN "hubspotCompanyId" TEXT;

CREATE UNIQUE INDEX "User_hubspotContactId_key" ON "User"("hubspotContactId");
CREATE UNIQUE INDEX "Organization_hubspotCompanyId_key" ON "Organization"("hubspotCompanyId");
