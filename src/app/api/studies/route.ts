import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const studySchema = z.object({
  title: z.string().min(1).max(140),
  thesis: z.string().min(1),
  tags: z.array(z.string()).default([]),
  reportModules: z.array(z.string()).default([]),
  metrics: z.record(z.string(), z.unknown()).default({})
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const studies = await prisma.savedStudy.findMany({
      where: { ownerId: user.id, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      take: 50
    });

    return NextResponse.json({ studies });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const body = studySchema.parse(await request.json());
    const study = await prisma.savedStudy.create({
      data: {
        ownerId: user.id,
        title: body.title,
        thesis: body.thesis,
        tags: body.tags,
        reportModules: body.reportModules,
        metrics: body.metrics as Prisma.InputJsonValue
      }
    });

    return NextResponse.json({ study });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
