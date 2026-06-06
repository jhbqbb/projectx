import { NextResponse } from "next/server";
import { getAnalyticsSnapshot } from "@/server/analytics";

export async function GET() {
  const snapshot = await getAnalyticsSnapshot();
  return NextResponse.json(snapshot);
}
