import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateStatSummary, findPatternCandidates } from "@/server/statistics";
import type { ChartPoint, SessionDay, StatSummary } from "@/types";

type DatasetRecord = {
  id: string;
  name: string;
  ticker: string;
  source: string;
  interval: string;
  candleCount: number;
  tradingDayCount: number;
  coverageScore: number;
  fromDate: Date | null;
  toDate: Date | null;
  updatedAt: Date;
  metadata: unknown;
  tradingDays: unknown[];
};

export type AnalyticsSnapshot = {
  hasData: boolean;
  dataset: null | {
    id: string;
    name: string;
    ticker: string;
    source: string;
    interval: string;
    candleCount: number;
    tradingDayCount: number;
    coverageScore: number;
    fromDate: string | null;
    toDate: string | null;
    updatedAt: string;
  };
  summary: StatSummary | null;
  sessions: SessionDay[];
  charts: {
    probability: ChartPoint[];
    weekday: ChartPoint[];
    distribution: ChartPoint[];
    equity: ChartPoint[];
    heatmap: Array<{ day: string; condition: string; value: number; sampleSize: number }>;
  };
  patterns: ReturnType<typeof findPatternCandidates>;
  warnings: string[];
  noDataReason?: string;
};

function decimalToNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return Number(value);
}

export function rowToSessionDay(row: Record<string, unknown>): SessionDay {
  return {
    tradingDate: row.tradingDate instanceof Date ? row.tradingDate.toISOString().slice(0, 10) : String(row.tradingDate),
    weekday: Number(row.weekday),
    year: Number(row.year),
    month: Number(row.month),
    contextOpen: decimalToNumber(row.contextOpen),
    contextHigh: decimalToNumber(row.contextHigh),
    contextLow: decimalToNumber(row.contextLow),
    contextClose: decimalToNumber(row.contextClose),
    contextMovePct: row.contextMovePct === null ? null : Number(row.contextMovePct),
    contextRangePct: row.contextRangePct === null ? null : Number(row.contextRangePct),
    contextDirection: row.contextDirection as SessionDay["contextDirection"],
    contextCandleCount: Number(row.contextCandleCount),
    regularOpen: decimalToNumber(row.regularOpen),
    regularHigh: decimalToNumber(row.regularHigh),
    regularLow: decimalToNumber(row.regularLow),
    regularClose: decimalToNumber(row.regularClose),
    regularMovePct: row.regularMovePct === null ? null : Number(row.regularMovePct),
    regularRangePct: row.regularRangePct === null ? null : Number(row.regularRangePct),
    regularDirection: row.regularDirection as SessionDay["regularDirection"],
    regularCandleCount: Number(row.regularCandleCount),
    regularOpenVsContextHighPct: row.regularOpenVsContextHighPct === null ? null : Number(row.regularOpenVsContextHighPct),
    regularOpenVsContextLowPct: row.regularOpenVsContextLowPct === null ? null : Number(row.regularOpenVsContextLowPct),
    regularBrokeContextHigh: Boolean(row.regularBrokeContextHigh),
    regularBrokeContextLow: Boolean(row.regularBrokeContextLow),
    regularReversedContext: Boolean(row.regularReversedContext),
    dataQualityScore: Number(row.dataQualityScore)
  };
}

function noDataSnapshot(reason = "No historical dataset has been ingested yet."): AnalyticsSnapshot {
  return {
    hasData: false,
    dataset: null,
    summary: null,
    sessions: [],
    charts: {
      probability: [],
      weekday: [],
      distribution: [],
      equity: [],
      heatmap: []
    },
    patterns: [],
    warnings: [],
    noDataReason: reason
  };
}

function buildDistribution(days: SessionDay[]): ChartPoint[] {
  const distribution = days
    .filter((day) => day.regularMovePct !== null)
    .reduce<Record<string, number>>((acc, day) => {
      const bucket = (Math.round((day.regularMovePct ?? 0) * 10) / 10).toFixed(1);
      acc[bucket] = (acc[bucket] ?? 0) + 1;
      return acc;
    }, {});

  return Object.entries(distribution)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([name, value]) => ({ name, value }));
}

function buildEquityCurve(days: SessionDay[]): ChartPoint[] {
  let balance = 10000;
  return days
    .filter((day) => day.regularMovePct !== null)
    .map((day, index) => {
      balance = balance * (1 + (day.regularMovePct ?? 0) / 100);
      return {
        name: day.tradingDate.slice(5),
        value: Math.round(balance),
        sampleSize: index + 1
      };
    });
}

function buildHeatmap(summary: StatSummary) {
  return summary.weekday.flatMap((row) => [
    {
      day: row.label,
      condition: "Context bullish -> response bearish",
      value: row.contextBullishRegularBearish,
      sampleSize: row.sampleSize
    },
    {
      day: row.label,
      condition: "Context bearish -> response bullish",
      value: row.contextBearishRegularBullish,
      sampleSize: row.sampleSize
    },
    {
      day: row.label,
      condition: "Same-direction continuation",
      value: row.continuation,
      sampleSize: row.sampleSize
    }
  ]);
}

export async function loadLatestDataset(ownerId?: string | null, datasetId?: string | null) {
  const where = {
    status: "READY" as const,
    ...(ownerId ? { ownerId } : {}),
    ...(datasetId ? { id: datasetId } : {})
  };

  return prisma.dataset.findFirst({
    where,
    orderBy: { updatedAt: "desc" },
    include: { tradingDays: { orderBy: { tradingDate: "asc" } } }
  });
}

export async function getAnalyticsSnapshot(params: { ownerId?: string | null; datasetId?: string | null } = {}): Promise<AnalyticsSnapshot> {
  try {
    const dataset = (await loadLatestDataset(params.ownerId, params.datasetId)) as unknown as DatasetRecord | null;

    if (!dataset || !dataset.tradingDays.length) {
      return noDataSnapshot();
    }

    const sessions = dataset.tradingDays.map((day) => rowToSessionDay(day as Record<string, unknown>));
    const summary = calculateStatSummary(sessions);

    if (!summary.sampleSize) {
      return noDataSnapshot("The latest dataset exists, but it does not contain enough session data for statistics.");
    }

    const patterns = findPatternCandidates(sessions);
    const dataModeWarning =
      dataset.interval === "DAILY"
        ? "Alpha Vantage intraday data was unavailable for this key, so the platform is using real daily OHLCV fallback: prior close -> open context and open -> close response."
        : "Alpha Vantage US equity intraday extended-hours coverage is 4:00am to 8:00pm ET; overnight futures-style sessions need a different data source.";
    const warnings = [
      ...(summary.sampleSize < 250 ? ["Sample size is modest. Treat this as descriptive research, not proof of an edge."] : []),
      ...(summary.confidence < 60 ? ["Confidence is below 60. Validate on a larger holdout period."] : []),
      dataModeWarning
    ];

    return {
      hasData: true,
      dataset: {
        id: dataset.id,
        name: dataset.name,
        ticker: dataset.ticker,
        source: dataset.source,
        interval: dataset.interval,
        candleCount: dataset.candleCount,
        tradingDayCount: dataset.tradingDayCount,
        coverageScore: dataset.coverageScore,
        fromDate: dataset.fromDate?.toISOString() ?? null,
        toDate: dataset.toDate?.toISOString() ?? null,
        updatedAt: dataset.updatedAt.toISOString()
      },
      summary,
      sessions,
      charts: {
        probability: [
          { name: "Context bull -> response bear", value: summary.contextBullishRegularBearish, sampleSize: summary.sampleSize },
          { name: "Context bear -> response bull", value: summary.contextBearishRegularBullish, sampleSize: summary.sampleSize },
          { name: "Continuation", value: summary.continuation, sampleSize: summary.sampleSize }
        ],
        weekday: summary.weekday.map((row) => ({
          name: row.label,
          value: row.contextBullishRegularBearish,
          secondary: row.contextBearishRegularBullish,
          sampleSize: row.sampleSize
        })),
        distribution: buildDistribution(sessions),
        equity: buildEquityCurve(sessions),
        heatmap: buildHeatmap(summary)
      },
      patterns,
      warnings
    };
  } catch {
    return noDataSnapshot("Database is not connected yet, or no historical dataset has been ingested.");
  }
}
