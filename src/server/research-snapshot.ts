import { randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAnalyticsSnapshot, type AnalyticsSnapshot } from "@/server/analytics";
import { ingestTwelveDataDataset } from "@/server/ingestion";

type SnapshotParams = {
  ownerId?: string | null;
  datasetId?: string | null;
  autoIngest?: boolean;
};

async function getResearchOwner() {
  return prisma.user.upsert({
    where: { email: "local@research.internal" },
    update: {},
    create: {
      email: "local@research.internal",
      name: "Local Research Owner",
      passwordHash: await hashPassword(`local-${randomUUID()}`)
    },
    select: { id: true }
  });
}

function withNoDataReason(snapshot: AnalyticsSnapshot, reason: string): AnalyticsSnapshot {
  return {
    ...snapshot,
    noDataReason: reason
  };
}

export async function getResearchSnapshot(params: SnapshotParams = {}): Promise<AnalyticsSnapshot> {
  const requested = await getAnalyticsSnapshot({
    ownerId: params.ownerId,
    datasetId: params.datasetId
  });

  if (requested.hasData || params.datasetId) {
    return requested;
  }

  if (params.ownerId) {
    const globalSnapshot = await getAnalyticsSnapshot();

    if (globalSnapshot.hasData) {
      return globalSnapshot;
    }
  }

  if (params.autoIngest === false) {
    return requested;
  }

  if (!process.env.TWELVE_DATA_API_KEY) {
    return withNoDataReason(
      requested,
      `${requested.noDataReason ?? "No minute-candle dataset has been ingested yet."} TWELVE_DATA_API_KEY is not configured for this deployment, so automatic Twelve Data ingestion cannot run.`
    );
  }

  try {
    const ownerId = params.ownerId ?? (await getResearchOwner()).id;
    const ticker = process.env.DEFAULT_RESEARCH_TICKER ?? "QQQ";

    await ingestTwelveDataDataset({
      ownerId,
      ticker,
      interval: "15min"
    });

    return getAnalyticsSnapshot({
      ownerId: params.ownerId
    });
  } catch (error) {
    return withNoDataReason(
      requested,
      error instanceof Error
        ? `No minute-candle dataset is available yet, and automatic Twelve Data ingestion failed: ${error.message}`
        : "No minute-candle dataset is available yet, and automatic Twelve Data ingestion failed."
    );
  }
}
