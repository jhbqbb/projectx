import { NextRequest, NextResponse } from "next/server";
import { getIctPatternMap } from "@/server/ict-patterns";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const direction = params.get("direction");
  const payload = await getIctPatternMap({
    mode: params.get("mode") === "continuation" ? "continuation" : "reversal",
    day: params.get("day") ?? "ALL",
    direction: direction === "HIGH" || direction === "LOW" ? direction : "BOTH",
    minN: Number(params.get("minN") ?? 10),
    minEdge: Number(params.get("minEdge") ?? 50),
    minCiLow: Number(params.get("minCiLow") ?? 0),
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined
  });

  return NextResponse.json(payload);
}
