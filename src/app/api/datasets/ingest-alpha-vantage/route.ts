import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ingestAlphaVantageDataset, ingestTwelveDataDataset } from "@/server/ingestion";
import type { TwelveDataInterval } from "@/server/twelve-data";

const ingestSchema = z.object({
  ticker: z.string().min(1).max(12).default("NASDAQ"),
  interval: z.enum(["1min", "5min", "15min", "30min", "60min"]).default("15min"),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  provider: z.enum(["twelve-data", "alpha-vantage"]).default("twelve-data")
});

async function getIngestionOwner(request: NextRequest) {
  const user = await getCurrentUser(request);

  if (user) {
    return user;
  }

  return prisma.user.upsert({
    where: { email: "local@research.internal" },
    update: {},
    create: {
      email: "local@research.internal",
      name: "Local Research Owner",
      passwordHash: await hashPassword(`local-${randomUUID()}`)
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getIngestionOwner(request);
    const body = ingestSchema.parse(await request.json());

    if (body.provider === "twelve-data" && body.interval === "60min") {
      throw new Error("Twelve Data ingestion supports 1min, 5min, 15min, or 30min. Use 15min for session research.");
    }

    const dataset =
      body.provider === "twelve-data"
        ? await ingestTwelveDataDataset({
            ownerId: user.id,
            ticker: body.ticker,
            interval: body.interval as TwelveDataInterval
          })
        : await ingestAlphaVantageDataset({
            ownerId: user.id,
            ticker: body.ticker,
            interval: body.interval,
            month: body.month
          });

    return NextResponse.json({ dataset });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to ingest market data." },
      { status: 400 }
    );
  }
}
