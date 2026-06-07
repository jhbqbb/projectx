import { NextResponse } from "next/server";
import { getResearchSnapshot } from "@/server/research-snapshot";

export const maxDuration = 60;

export async function GET() {
  const snapshot = await getResearchSnapshot();
  return NextResponse.json({
    hasData: snapshot.hasData,
    dataset: snapshot.dataset,
    patterns: snapshot.patterns,
    heatmap: snapshot.charts.heatmap,
    noDataReason: snapshot.noDataReason
  });
}
