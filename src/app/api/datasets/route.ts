import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const datasetSchema = z.object({
  name: z.string().min(1).max(120),
  ticker: z.string().min(1).max(12).default("NASDAQ")
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const datasets = await prisma.dataset.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 50
    });

    return NextResponse.json({ datasets });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const body = datasetSchema.parse(await request.json());
    const dataset = await prisma.dataset.create({
      data: {
        ownerId: user.id,
        name: body.name,
        ticker: body.ticker.toUpperCase(),
        source: "CSV_UPLOAD",
        status: "PENDING"
      }
    });

    return NextResponse.json({ dataset });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
