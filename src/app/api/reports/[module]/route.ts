import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getResearchSnapshot } from "@/server/research-snapshot";
import { buildReport } from "@/server/reports";

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const user = await getCurrentUser(request);
  const datasetId = request.nextUrl.searchParams.get("datasetId");

  const snapshot = await getResearchSnapshot({
    ownerId: user?.id,
    datasetId
  });

  if (!snapshot.hasData) {
    return NextResponse.json({
      hasData: false,
      report: null,
      noDataReason: snapshot.noDataReason
    });
  }

  return NextResponse.json({
    hasData: true,
    dataset: snapshot.dataset,
    report: buildReport(module, snapshot.sessions)
  });
}
