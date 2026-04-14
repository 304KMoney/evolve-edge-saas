import { NextResponse } from "next/server";
import {
  getFulfillmentDispatchHealthSnapshot,
  isAuthorizedFulfillmentHealthRequest
} from "../../../../lib/fulfillment-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorizedFulfillmentHealthRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const snapshot = await getFulfillmentDispatchHealthSnapshot();
  return NextResponse.json(snapshot);
}
