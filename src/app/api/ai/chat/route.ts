import { NextRequest } from "next/server";
import { z } from "zod";
import { buildResearchContext, buildSystemInstructions, createFallbackAnswer, getOpenAIClient } from "@/server/ai-orchestrator";
import { getIctPatternMap } from "@/server/ict-patterns";
import { getResearchSnapshot } from "@/server/research-snapshot";

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

async function getIctCalculations() {
  try {
    const maps = await Promise.all(
      (["15min", "1h", "4h"] as const).map((interval) =>
        getIctPatternMap({ interval, mode: "reversal", minN: interval === "4h" ? 3 : 10, minEdge: 50 })
      )
    );

    return maps.flatMap((map) => [
      `ICT ${map.meta.intervalLabel} dataset: ${map.meta.symbol} on ${map.meta.exchange}/${map.meta.micCode}, ${map.meta.from} -> ${map.meta.to}, ${map.meta.tradingDays} trading days, ${map.meta.totalCandles} candles, all times America/New_York.`,
      `ICT ${map.meta.intervalLabel} reversal map: ${map.summary.patterns} visible patterns; ${map.summary.sweepEvents} sweep events; sample-weighted edge ${map.summary.weightedEdge}%.`,
      ...map.rows.slice(0, 3).map(
        (row) =>
          `${map.meta.intervalLabel} ${row.day} ${row.target} -> ${row.sweep} ${row.direction.toLowerCase()} sweep: ${row.edge}% ${map.meta.mode}, CI [${row.ciLow}-${row.ciHigh}], n=${row.n}/${row.opportunities}, depth ${row.depth} pts, rejection ${row.rejection} pts, trade ${row.trade}.`
      )
    ]);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const body = chatSchema.parse(await request.json());
  const snapshot = await getResearchSnapshot();
  const ictCalculations = await getIctCalculations();
  const context = buildResearchContext({
    question: body.message,
    selectedReports: body.selectedReports,
    days: snapshot.sessions,
    sourceDatasets: snapshot.dataset ? [`${snapshot.dataset.name} (${snapshot.dataset.source})`] : [],
    noDataReason: snapshot.noDataReason,
    ictCalculations
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
            effort: envChoice(process.env.OPENAI_REASONING_EFFORT, reasoningEfforts, "medium")
          },
          text: {
            verbosity: envChoice(process.env.OPENAI_VERBOSITY, verbosityLevels, "medium")
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
