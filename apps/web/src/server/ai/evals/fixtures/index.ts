import { earlyFintechStartupFixture } from "./early-fintech-startup.fixture";
import { smallHealthtechCompanyFixture } from "./small-healthtech-company.fixture";
import { smallLawFirmFixture } from "./small-law-firm.fixture";

export const auditEvalFixtures = [
  smallLawFirmFixture,
  earlyFintechStartupFixture,
  smallHealthtechCompanyFixture,
] as const;
