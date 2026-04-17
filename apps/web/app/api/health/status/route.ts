import { prisma } from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { getEnvironmentParityStatus } from "../../../../lib/env-validation";
import { getRuntimeEnvironment } from "../../../../lib/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const parity = getEnvironmentParityStatus();
  const required = parity.filter((entry) => entry.required);
  const missingRequired = required.filter((entry) => !entry.configured).map((entry) => entry.key);

  let databaseOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  const ok = databaseOk && missingRequired.length === 0;

  return NextResponse.json(
    {
      ok,
      runtime: getRuntimeEnvironment(),
      checks: {
        database: databaseOk,
        envParity: missingRequired.length === 0
      },
      missingRequired,
      timestamp: new Date().toISOString()
    },
    {
      status: ok ? 200 : 503
    }
  );
}
