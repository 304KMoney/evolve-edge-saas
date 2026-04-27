import { earlyFintechStartupGolden } from "./early-fintech-startup.golden";
import { smallHealthtechCompanyGolden } from "./small-healthtech-company.golden";
import { smallLawFirmGolden } from "./small-law-firm.golden";

export const auditEvalGoldens = [
  smallLawFirmGolden,
  earlyFintechStartupGolden,
  smallHealthtechCompanyGolden,
] as const;
