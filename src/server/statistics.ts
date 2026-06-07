import { format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { NY_TIME_ZONE } from "@/lib/constants";
import { clamp } from "@/lib/utils";
import type { BreakDownRow, Direction, SessionDay, StatSummary } from "@/types";

export type CandleInput = {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | bigint;
  raw?: unknown;
};

type SessionBucket = {
  context: CandleInput[];
  regular: CandleInput[];
  openingRange: CandleInput[];
};

const CONTEXT_START_MINUTE = 4 * 60;
const CONTEXT_END_MINUTE = 9 * 60 + 25;
const NY_START_MINUTE = 9 * 60 + 30;
const NY_END_MINUTE = 16 * 60;
const OPENING_RANGE_END_MINUTE = 10 * 60;

export function directionFromMove(open: number | null, close: number | null): Direction {
  if (open === null || close === null || open === 0) {
    return "UNKNOWN";
  }

  const pct = ((close - open) / open) * 100;

  if (Math.abs(pct) < 0.025) {
    return "FLAT";
  }

  return pct > 0 ? "BULLISH" : "BEARISH";
}

export function pctMove(open: number | null, close: number | null) {
  if (open === null || close === null || open === 0) {
    return null;
  }

  return ((close - open) / open) * 100;
}

function minutesInNewYork(date: Date) {
  const zoned = toZonedTime(date, NY_TIME_ZONE);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

function tradingDateForContextCandle(date: Date) {
  const zoned = toZonedTime(date, NY_TIME_ZONE);
  return format(zoned, "yyyy-MM-dd");
}

function tradingDateForRegularCandle(date: Date) {
  const zoned = toZonedTime(date, NY_TIME_ZONE);
  return format(zoned, "yyyy-MM-dd");
}

function toTradingDateDate(dateKey: string) {
  return fromZonedTime(`${dateKey}T00:00:00`, NY_TIME_ZONE);
}

function summarizeCandles(candles: CandleInput[]) {
  if (!candles.length) {
    return null;
  }

  const sorted = [...candles].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const open = sorted[0]?.open ?? null;
  const close = sorted[sorted.length - 1]?.close ?? null;
  const high = Math.max(...sorted.map((candle) => candle.high));
  const low = Math.min(...sorted.map((candle) => candle.low));
  const move = pctMove(open, close);
  const range = open ? ((high - low) / open) * 100 : null;

  return {
    open,
    close,
    high,
    low,
    move,
    range,
    direction: directionFromMove(open, close),
    count: sorted.length
  };
}

export function deriveTradingDaysFromCandles(candles: CandleInput[], intervalMinutes = 5): SessionDay[] {
  const buckets = new Map<string, SessionBucket>();

  for (const candle of candles) {
    const minute = minutesInNewYork(candle.timestamp);
    const isContext = minute >= CONTEXT_START_MINUTE && minute <= CONTEXT_END_MINUTE;
    const isRegular = minute >= NY_START_MINUTE && minute <= NY_END_MINUTE;
    const isOpeningRange = minute >= NY_START_MINUTE && minute < OPENING_RANGE_END_MINUTE;

    if (!isContext && !isRegular) {
      continue;
    }

    const tradingDate = isContext ? tradingDateForContextCandle(candle.timestamp) : tradingDateForRegularCandle(candle.timestamp);
    const bucket = buckets.get(tradingDate) ?? { context: [], regular: [], openingRange: [] };

    if (isContext) {
      bucket.context.push(candle);
    }

    if (isRegular) {
      bucket.regular.push(candle);
    }

    if (isOpeningRange) {
      bucket.openingRange.push(candle);
    }

    buckets.set(tradingDate, bucket);
  }

  return [...buckets.entries()]
    .map(([dateKey, bucket]) => {
      const context = summarizeCandles(bucket.context);
      const regular = summarizeCandles(bucket.regular);
      const openingRange = summarizeCandles(bucket.openingRange);
      const tradingDate = toTradingDateDate(dateKey);
      const expectedContext = Math.round((5.42 * 60) / intervalMinutes);
      const expectedRegular = Math.round((6.5 * 60) / intervalMinutes) + 1;
      const contextCoverage = context ? clamp(context.count / expectedContext, 0, 1) : 0;
      const regularCoverage = regular ? clamp(regular.count / expectedRegular, 0, 1) : 0;
      const dataQualityScore = Number(((contextCoverage + regularCoverage) / 2).toFixed(3));
      const regularOpenVsContextHighPct =
        regular?.open && context?.high ? ((regular.open - context.high) / context.high) * 100 : null;
      const regularOpenVsContextLowPct =
        regular?.open && context?.low ? ((regular.open - context.low) / context.low) * 100 : null;
      const regularBrokeContextHigh = Boolean(regular?.high && context?.high && regular.high > context.high);
      const regularBrokeContextLow = Boolean(regular?.low && context?.low && regular.low < context.low);
      const regularReversedContext =
        Boolean(context?.direction && regular?.direction) &&
        context?.direction !== "UNKNOWN" &&
        regular?.direction !== "UNKNOWN" &&
        context?.direction !== "FLAT" &&
        regular?.direction !== "FLAT" &&
        context?.direction !== regular?.direction;

      return {
        tradingDate: dateKey,
        weekday: tradingDate.getUTCDay(),
        year: tradingDate.getUTCFullYear(),
        month: tradingDate.getUTCMonth() + 1,
        contextOpen: context?.open ?? null,
        contextHigh: context?.high ?? null,
        contextLow: context?.low ?? null,
        contextClose: context?.close ?? null,
        contextMovePct: context?.move ?? null,
        contextRangePct: context?.range ?? null,
        contextDirection: context?.direction ?? "UNKNOWN",
        contextCandleCount: context?.count ?? 0,
        regularOpen: regular?.open ?? null,
        regularHigh: regular?.high ?? null,
        regularLow: regular?.low ?? null,
        regularClose: regular?.close ?? null,
        regularMovePct: regular?.move ?? null,
        regularRangePct: regular?.range ?? null,
        regularDirection: regular?.direction ?? "UNKNOWN",
        regularCandleCount: regular?.count ?? 0,
        regularOpenVsContextHighPct,
        regularOpenVsContextLowPct,
        regularBrokeContextHigh,
        regularBrokeContextLow,
        regularReversedContext,
        dataQualityScore,
        openingRangeHigh: openingRange?.high ?? null,
        openingRangeLow: openingRange?.low ?? null
      } satisfies SessionDay & {
        openingRangeHigh: number | null;
        openingRangeLow: number | null;
      };
    })
    .sort((a, b) => a.tradingDate.localeCompare(b.tradingDate));
}

function validDirection(direction: Direction) {
  return direction === "BULLISH" || direction === "BEARISH";
}

function mean(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const avg = mean(values);
  const variance = mean(values.map((value) => Math.pow(value - avg, 2)));
  return Math.sqrt(variance);
}

function probability(sample: SessionDay[], predicate: (day: SessionDay) => boolean) {
  if (!sample.length) {
    return 0;
  }

  return (sample.filter(predicate).length / sample.length) * 100;
}

function confidenceScore(days: SessionDay[], stdDev: number) {
  const sampleComponent = Math.min(1, Math.sqrt(days.length / 140));
  const quality = days.length ? mean(days.map((day) => day.dataQualityScore || 0.5)) : 0;
  const volatilityPenalty = Math.min(0.18, stdDev / 8);
  const qualityPenalty = Math.max(0, 1 - quality) * 0.28;
  return clamp((sampleComponent - volatilityPenalty - qualityPenalty) * 100, 0, 100);
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function summarizeGroup(days: SessionDay[], key: string, label: string): BreakDownRow {
  const valid = days.filter((day) => validDirection(day.contextDirection) && validDirection(day.regularDirection));
  const bullContext = valid.filter((day) => day.contextDirection === "BULLISH");
  const bearContext = valid.filter((day) => day.contextDirection === "BEARISH");
  const signedMoves = valid.map((day) => day.regularMovePct ?? 0);
  const absMoves = signedMoves.map((value) => Math.abs(value));
  const stdDev = standardDeviation(signedMoves);

  return {
    key,
    label,
    sampleSize: valid.length,
    contextBullishRegularBearish: round(probability(bullContext, (day) => day.regularDirection === "BEARISH"), 1),
    contextBearishRegularBullish: round(probability(bearContext, (day) => day.regularDirection === "BULLISH"), 1),
    continuation: round(probability(valid, (day) => day.contextDirection === day.regularDirection), 1),
    averageMove: round(mean(absMoves), 2),
    medianMove: round(median(absMoves), 2),
    expectancy: round(mean(signedMoves), 2),
    confidence: round(confidenceScore(valid, stdDev), 0)
  };
}

function breakdown(days: SessionDay[], by: "year" | "month" | "weekday") {
  const labels: Record<string, string> = {};
  const groups = new Map<string, SessionDay[]>();

  for (const day of days) {
    const key = String(day[by]);
    groups.set(key, [...(groups.get(key) ?? []), day]);

    if (by === "month") {
      labels[key] = new Date(2026, Number(key) - 1, 1).toLocaleString("en-US", { month: "short" });
    } else if (by === "weekday") {
      labels[key] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][Number(key)] ?? key;
    } else {
      labels[key] = key;
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([key, group]) => summarizeGroup(group, key, labels[key] ?? key));
}

export function calculateStatSummary(days: SessionDay[]): StatSummary {
  const valid = days.filter((day) => validDirection(day.contextDirection) && validDirection(day.regularDirection));
  const bullContext = valid.filter((day) => day.contextDirection === "BULLISH");
  const bearContext = valid.filter((day) => day.contextDirection === "BEARISH");
  const signedMoves = valid.map((day) => day.regularMovePct ?? 0);
  const absMoves = signedMoves.map((value) => Math.abs(value));
  const stdDev = standardDeviation(signedMoves);

  return {
    sampleSize: valid.length,
    contextBullishRegularBearish: round(probability(bullContext, (day) => day.regularDirection === "BEARISH"), 1),
    contextBearishRegularBullish: round(probability(bearContext, (day) => day.regularDirection === "BULLISH"), 1),
    continuation: round(probability(valid, (day) => day.contextDirection === day.regularDirection), 1),
    averageMove: round(mean(absMoves), 2),
    medianMove: round(median(absMoves), 2),
    maximumMove: round(absMoves.length ? Math.max(...absMoves) : 0, 2),
    standardDeviation: round(stdDev, 2),
    expectancy: round(mean(signedMoves), 2),
    confidence: round(confidenceScore(valid, stdDev), 0),
    yearly: breakdown(valid, "year"),
    monthly: breakdown(valid, "month"),
    weekday: breakdown(valid, "weekday")
  };
}

export function findPatternCandidates(days: SessionDay[]) {
  const valid = days.filter((day) => validDirection(day.contextDirection) && validDirection(day.regularDirection));
  const conditions = [
    {
      id: "open-above-context-high",
      label: "Regular session opens above context high",
      filter: (day: SessionDay) => (day.regularOpenVsContextHighPct ?? -1) > 0
    },
    {
      id: "open-below-context-low",
      label: "Regular session opens below context low",
      filter: (day: SessionDay) => (day.regularOpenVsContextLowPct ?? 1) < 0
    },
    {
      id: "large-context-range",
      label: "Context range above 0.55%",
      filter: (day: SessionDay) => (day.contextRangePct ?? 0) > 0.55
    },
    {
      id: "breaks-both-sides",
      label: "Regular session breaks both context extremes",
      filter: (day: SessionDay) => day.regularBrokeContextHigh && day.regularBrokeContextLow
    },
    {
      id: "friday-reversal",
      label: "Friday reversal profile",
      filter: (day: SessionDay) => day.weekday === 5 && day.regularReversedContext
    }
  ];

  return conditions
    .map((condition) => {
      const sample = valid.filter(condition.filter);
      const reversed = sample.filter((day) => day.regularReversedContext);
      const moves = sample.map((day) => Math.abs(day.regularMovePct ?? 0));
      const summary = summarizeGroup(sample, condition.id, condition.label);

      return {
        id: condition.id,
        label: condition.label,
        sampleSize: sample.length,
        reversalRate: sample.length ? round((reversed.length / sample.length) * 100, 1) : 0,
        averageMove: round(mean(moves), 2),
        confidence: summary.confidence,
        risk:
          sample.length < 30
            ? "Low sample size"
            : summary.confidence < 55
              ? "Unstable edge"
              : "Researchable"
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
}
