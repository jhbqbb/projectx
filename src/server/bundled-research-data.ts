import { readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { calculateStatSummary, deriveOpeningContextTradingDaysFromCandles, findPatternCandidates, type CandleInput } from "@/server/statistics";
import type { AnalyticsSnapshot } from "@/server/analytics";
import type { ChartPoint, SessionDay, StatSummary } from "@/types";

type CsvRow = {
  timestamp?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
};

let cachedSnapshot: AnalyticsSnapshot | null = null;

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

function parseCandles(csv: string): CandleInput[] {
  const parsed = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase()
  });

  return parsed.data
    .map((row) => ({
      timestamp: row.timestamp ? new Date(row.timestamp) : new Date("invalid"),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume ?? 0),
      raw: row
    }))
    .filter(
      (candle) =>
        !Number.isNaN(candle.timestamp.getTime()) &&
        [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export async function getBundledResearchSnapshot(): Promise<AnalyticsSnapshot> {
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  const csvPath = path.join(process.cwd(), "public", "data", "nasdaq-qqq-15min-ohlcv.csv");
  const csv = await readFile(csvPath, "utf8");
  const candles = parseCandles(csv);
  const sessions = deriveOpeningContextTradingDaysFromCandles(candles, 15);
  const summary = calculateStatSummary(sessions);
  const patterns = findPatternCandidates(sessions);
  const fromDate = candles[0]?.timestamp.toISOString() ?? null;
  const toDate = candles[candles.length - 1]?.timestamp.toISOString() ?? null;
  const coverageScore = sessions.length
    ? sessions.reduce((sum, day) => sum + day.dataQualityScore, 0) / sessions.length
    : 0;

  cachedSnapshot = {
    hasData: true,
    dataset: {
      id: "bundled-nasdaq-qqq-15min",
      name: "Bundled Nasdaq QQQ 15min Twelve Data OHLCV",
      ticker: "NASDAQ",
      source: "BUNDLED_TWELVE_DATA",
      interval: "FIFTEEN_MINUTES",
      candleCount: candles.length,
      tradingDayCount: sessions.length,
      coverageScore,
      fromDate,
      toDate,
      updatedAt: toDate ?? new Date().toISOString()
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
    warnings: [
      "Using bundled real Twelve Data QQQ 15-minute OHLCV because PostgreSQL is not connected for this deployment.",
      "Sample size is modest. Treat this as descriptive research, not proof of an edge.",
      "Twelve Data pre/post-market data requires a paid provider plan, so this dataset uses 09:30-09:59 opening context and 10:00-15:59 response."
    ]
  };

  return cachedSnapshot;
}
