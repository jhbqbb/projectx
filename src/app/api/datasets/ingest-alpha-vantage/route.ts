import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ingestAlphaVantageDataset } from "@/server/ingestion";

const ingestSchema = z.object({
  ticker: z.string().min(1).max(12).default("QQQ"),
  interval: z.enum(["1min", "5min", "15min", "30min", "60min"]).default("5min"),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  mode: z.enum(["auto", "daily"]).default("auto")
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
    const dataset = await ingestAlphaVantageDataset({
      ownerId: user.id,
      ticker: body.ticker,
      interval: body.interval,
      month: body.month,
      mode: body.mode
    });

    return NextResponse.json({ dataset });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to ingest Alpha Vantage data." },
      { status: 400 }
    );
  }
}
