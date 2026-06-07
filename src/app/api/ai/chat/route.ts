import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildResearchContext, buildSystemInstructions, createFallbackAnswer, getOpenAIClient } from "@/server/ai-orchestrator";
import { getAnalyticsSnapshot, type AnalyticsSnapshot } from "@/server/analytics";
import { ingestTwelveDataDataset } from "@/server/ingestion";

const chatSchema = z.object({
  message: z.string().min(1),
  selectedReports: z.array(z.string()).default([]),
  sessionId: z.string().optional()
});

const reasoningEfforts = ["minimal", "low", "medium", "high", "xhigh"] as const;
const verbosityLevels = ["low", "medium", "high"] as const;

export const maxDuration = 60;

function envChoice<T extends readonly string[]>(value: string | undefined, allowed: T, fallback: T[number]): T[number] {
  return allowed.includes(value ?? "") ? (value as T[number]) : fallback;
}

function envPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function writeText(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, text: string) {
  const chunks = text.match(/.{1,18}(\s|$)/g) ?? [text];

  for (const chunk of chunks) {
    controller.enqueue(encoder.encode(sse({ type: "delta", delta: chunk })));
    await new Promise((resolve) => setTimeout(resolve, 18));
  }
}

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

async function getSnapshotWithAutoIngest(): Promise<AnalyticsSnapshot> {
  const snapshot = await getAnalyticsSnapshot();

  if (snapshot.hasData || !process.env.TWELVE_DATA_API_KEY) {
    return snapshot;
  }

  try {
    const owner = await getResearchOwner();
    await ingestTwelveDataDataset({
      ownerId: owner.id,
      ticker: "NASDAQ",
      interval: "15min"
    });

    return getAnalyticsSnapshot();
  } catch (error) {
    return {
      ...snapshot,
      noDataReason:
        error instanceof Error
          ? `No dataset is available yet, and automatic Twelve Data ingestion failed: ${error.message}`
          : "No dataset is available yet, and automatic Twelve Data ingestion failed."
    };
  }
}

export async function POST(request: NextRequest) {
  const body = chatSchema.parse(await request.json());
  const snapshot = await getSnapshotWithAutoIngest();
  const context = buildResearchContext({
    question: body.message,
    selectedReports: body.selectedReports,
    days: snapshot.sessions,
    sourceDatasets: snapshot.dataset ? [`${snapshot.dataset.name} (${snapshot.dataset.source})`] : [],
    noDataReason: snapshot.noDataReason
  });
  const encoder = new TextEncoder();
  const openai = getOpenAIClient();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(sse({ type: "context", context })));

      try {
        if (!context.hasData || !openai) {
          await writeText(controller, encoder, createFallbackAnswer(body.message, context));
          controller.enqueue(encoder.encode(sse({ type: "done" })));
          controller.close();
          return;
        }

        const response = await openai.responses.create({
          model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
          instructions: buildSystemInstructions(context),
          input: body.message,
          stream: true,
          reasoning: {
            effort: envChoice(process.env.OPENAI_REASONING_EFFORT, reasoningEfforts, "low")
          },
          text: {
            verbosity: envChoice(process.env.OPENAI_VERBOSITY, verbosityLevels, "low")
          },
          max_output_tokens: envPositiveInteger(process.env.OPENAI_MAX_OUTPUT_TOKENS, 1200),
          store: false
        } as Parameters<typeof openai.responses.create>[0]);

        for await (const event of response as AsyncIterable<Record<string, unknown>>) {
          if (event.type === "response.output_text.delta") {
            controller.enqueue(encoder.encode(sse({ type: "delta", delta: event.delta })));
          }

          if (event.type === "response.completed") {
            controller.enqueue(encoder.encode(sse({ type: "done" })));
          }
        }

        controller.close();
      } catch {
        await writeText(controller, encoder, createFallbackAnswer(body.message, context));
        controller.enqueue(encoder.encode(sse({ type: "done" })));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
