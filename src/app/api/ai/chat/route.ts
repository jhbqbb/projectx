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

function normalizeQuestionTime(value: string) {
  const match = value.toLowerCase().match(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?\b/);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = match[2] ?? "00";
  const meridiem = match[3];

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function parseQuestionFocus(question: string) {
  const lower = question.toLowerCase();
  const dayEntries = [
    ["MON", /\bmon(day)?\b/],
    ["TUE", /\btue(sday)?\b/],
    ["WED", /\bwed(nesday)?\b/],
    ["THU", /\bthu(rsday)?\b/],
    ["FRI", /\bfri(day)?\b/]
  ] as const;
  const day = dayEntries.find(([, pattern]) => pattern.test(lower))?.[0] ?? "ALL";
  const direction = lower.includes("low sweep") || lower.includes("takes low")
    ? "LOW"
    : lower.includes("high sweep") || lower.includes("takes high")
      ? "HIGH"
      : "BOTH";
  const timeMatches = [...question.matchAll(/\b(?:\d{1,2}:[0-5]\d\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/gi)]
    .map((match) => normalizeQuestionTime(match[0]))
    .filter((time): time is string => Boolean(time));
  const target = timeMatches[0] ?? "ALL";
  const sweep = timeMatches[1] ?? "ALL";
  const session = lower.includes("pm") || lower.includes("afternoon") || (target !== "ALL" && target >= "12:00") ? "PM" : "ALL";

  return { day, direction, target, sweep, session } as const;
}

function evidenceLabel(value: number) {
  if (value >= 30) return "stronger historical read";
  if (value >= 12) return "usable but still limited historical read";
  return "thin historical read";
}

function plainRowLine(prefix: string, row: Awaited<ReturnType<typeof getIctPatternMap>>["rows"][number], mode: string) {
  const direction = row.direction === "LOW" ? "low sweep" : "high sweep";
  const bias = row.trade
    .replace("LONG", "long")
    .replace("SHORT", "short")
    .replace("(fade)", "fade")
    .replace("(follow break down)", "follow breakdown")
    .replace("(follow break up)", "follow breakout");

  return `${prefix} ${row.day} ${row.target} to ${row.sweep} ${direction}: ${row.edge}% ${mode} read. Bias: ${bias}. Average sweep depth ${row.depth} points and rejection ${row.rejection} points. Evidence: ${evidenceLabel(row.n)}.`;
}

async function getIctCalculations(question: string) {
  try {
    const focus = parseQuestionFocus(question);
    const maps = await Promise.all([
      getIctPatternMap({
        interval: "5min",
        session: focus.session,
        mode: "reversal",
        day: focus.day,
        direction: focus.direction,
        target: focus.target,
        sweep: focus.sweep,
        minN: 1,
        minEdge: 0
      }),
      getIctPatternMap({
        interval: "15min",
        session: focus.session,
        mode: "reversal",
        day: focus.day,
        direction: focus.direction,
        target: focus.target,
        sweep: focus.sweep,
        minN: 1,
        minEdge: 0
      }),
      getIctPatternMap({ interval: "15min", session: "PM", mode: "reversal", minN: 10, minEdge: 48 }),
      getIctPatternMap({ interval: "30min", session: "PM", mode: "reversal", minN: 5, minEdge: 48 }),
      getIctPatternMap({ interval: "1h", mode: "reversal", minN: 8, minEdge: 50 }),
      getIctPatternMap({ interval: "4h", mode: "reversal", minN: 3, minEdge: 50 })
    ]);

    return [
      "ICT definition used here: a sweep means the later candle takes the target high/low; reversal means it closes back inside; continuation means it closes outside.",
      ...maps.flatMap((map) => [
        `ICT ${map.meta.intervalLabel} ${map.meta.sessionLabel}: ${map.meta.symbol} on ${map.meta.exchange}/${map.meta.micCode}, ${map.meta.from} to ${map.meta.to}, all times America/New_York. Available intraday bars in this file currently run through ${map.meta.availableEnd || "the regular close"}.`,
        `ICT ${map.meta.intervalLabel} ${map.meta.sessionLabel} overall reversal read: ${map.summary.weightedEdge}%.`,
        ...map.rows.slice(0, 3).map(
          (row) => plainRowLine(`ICT ${map.meta.intervalLabel} ${map.meta.sessionLabel}`, row, map.meta.mode)
        )
      ])
    ];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const body = chatSchema.parse(await request.json());
  const snapshot = await getResearchSnapshot();
  const ictCalculations = await getIctCalculations(body.message);
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
