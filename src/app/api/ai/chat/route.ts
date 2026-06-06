import { NextRequest } from "next/server";
import { z } from "zod";
import { buildResearchContext, buildSystemInstructions, createFallbackAnswer, getOpenAIClient } from "@/server/ai-orchestrator";
import { getAnalyticsSnapshot } from "@/server/analytics";

const chatSchema = z.object({
  message: z.string().min(1),
  selectedReports: z.array(z.string()).default([]),
  sessionId: z.string().optional()
});

const reasoningEfforts = ["minimal", "low", "medium", "high", "xhigh"] as const;
const verbosityLevels = ["low", "medium", "high"] as const;

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

export async function POST(request: NextRequest) {
  const body = chatSchema.parse(await request.json());
  const snapshot = await getAnalyticsSnapshot();
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
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            sse({
              type: "error",
              error: error instanceof Error ? error.message : "AI research stream failed."
            })
          )
        );
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
