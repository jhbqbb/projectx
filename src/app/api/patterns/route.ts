import { NextResponse } from "next/server";
import { getAnalyticsSnapshot } from "@/server/analytics";

export async function GET() {
  const snapshot = await getAnalyticsSnapshot();
  return NextResponse.json({
    hasData: snapshot.hasData,
    dataset: snapshot.dataset,
    patterns: snapshot.patterns,
    heatmap: snapshot.charts.heatmap,
    noDataReason: snapshot.noDataReason
  });
}
