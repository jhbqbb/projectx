import { NextRequest, NextResponse } from "next/server";
import { getIctPatternMap } from "@/server/ict-patterns";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const direction = params.get("direction");
  const interval = params.get("interval");
  const session = params.get("session");
  const payload = await getIctPatternMap({
    mode: params.get("mode") === "continuation" ? "continuation" : "reversal",
    interval: interval === "5min" || interval === "30min" || interval === "1h" || interval === "4h" ? interval : "15min",
    session: session === "AM" || session === "PM" ? session : "ALL",
    day: params.get("day") ?? "ALL",
    direction: direction === "HIGH" || direction === "LOW" ? direction : "BOTH",
    target: params.get("target") ?? "ALL",
    sweep: params.get("sweep") ?? "ALL",
    minN: Number(params.get("minN") ?? 10),
    minEdge: Number(params.get("minEdge") ?? 50),
    minCiLow: Number(params.get("minCiLow") ?? 0),
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined
  });

  return NextResponse.json(payload);
}
