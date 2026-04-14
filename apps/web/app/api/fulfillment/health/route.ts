import { NextResponse } from "next/server";
import {
  getFulfillmentHealthSnapshot,
  isAuthorizedFulfillmentHealthRequest
} from "../../../../lib/fulfillment-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedFulfillmentHealthRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const snapshot = await getFulfillmentHealthSnapshot();
  return NextResponse.json(snapshot);
}
