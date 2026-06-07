import { readFile } from "node:fs/promises";
import path from "node:path";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import Papa from "papaparse";
import { NY_TIME_ZONE } from "@/lib/constants";
import { clamp } from "@/lib/utils";

type CsvRow = {
  timestamp?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
};

type IctCandle = {
  timestamp: Date;
  nyDate: string;
  weekday: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type SweepDirection = "HIGH" | "LOW";
type PatternMode = "reversal" | "continuation";
type IctInterval = "15min" | "1h" | "4h";
type IctSession = "ALL" | "AM" | "PM";

export type IctPatternFilters = {
  mode?: PatternMode;
  interval?: IctInterval;
  session?: IctSession;
  day?: string;
  direction?: "BOTH" | SweepDirection;
  target?: string;
  sweep?: string;
  minN?: number;
  minEdge?: number;
  minCiLow?: number;
  from?: string;
  to?: string;
};

export type IctPatternRow = {
  id: string;
  day: string;
  target: string;
  sweep: string;
  direction: SweepDirection;
  trade: string;
  n: number;
  opportunities: number;
  frequency: number;
  reversal: number;
  continuation: number;
  edge: number;
  ciLow: number;
  ciHigh: number;
  depth: number;
  rejection: number;
};

type PatternAccumulator = {
  day: string;
  target: string;
  sweep: string;
  direction: SweepDirection;
  n: number;
  opportunities: number;
  reversals: number;
  continuations: number;
  depth: number[];
  rejection: number[];
};

type DirectionSummary = {
  direction: SweepDirection;
  label: string;
  frequencyText: string;
  reversal: number;
  continuation: number;
  ci: string;
  averageDepth: number;
  averageRejection: number;
  action: string;
  manipulation: string;
};

type CachedCandles = {
  candles: IctCandle[];
  from: string;
  to: string;
};

const cachedCandles = new Map<IctInterval, CachedCandles>();

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const intervalMeta: Record<IctInterval, { label: string; file: string }> = {
  "15min": { label: "15M", file: "nasdaq-ndx-15min-ohlcv.csv" },
  "1h": { label: "1H", file: "nasdaq-ndx-1h-ohlcv.csv" },
  "4h": { label: "4H", file: "nasdaq-ndx-4h-ohlcv.csv" }
};
const sessionMeta: Record<IctSession, { label: string; start: string; end: string }> = {
  ALL: { label: "Full session", start: "09:30", end: "16:30" },
  AM: { label: "AM session", start: "09:30", end: "11:45" },
  PM: { label: "PM session", start: "12:00", end: "16:30" }
};

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function points(value: number) {
  return value * 100;
}

function wilson(successes: number, total: number) {
  if (!total) {
    return { low: 0, high: 0 };
  }

  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

  return {
    low: clamp(((center - spread) / denominator) * 100, 0, 100),
    high: clamp(((center + spread) / denominator) * 100, 0, 100)
  };
}

function parseCandles(csv: string): IctCandle[] {
  const parsed = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase()
  });

  return parsed.data
    .map((row) => {
      const timestamp = row.timestamp ? new Date(row.timestamp) : new Date("invalid");
      const zoned = Number.isNaN(timestamp.getTime()) ? null : toZonedTime(timestamp, NY_TIME_ZONE);

      return {
        timestamp,
        nyDate: zoned ? format(zoned, "yyyy-MM-dd") : "",
        weekday: zoned ? zoned.getDay() : -1,
        time: zoned ? format(zoned, "HH:mm") : "",
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume ?? 0)
      };
    })
    .filter(
      (candle) =>
        candle.nyDate &&
        !Number.isNaN(candle.timestamp.getTime()) &&
        [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

async function loadCandles(interval: IctInterval) {
  const cached = cachedCandles.get(interval);

  if (cached) {
    return cached;
  }

  const csvPath = path.join(process.cwd(), "public", "data", intervalMeta[interval].file);
  const csv = await readFile(csvPath, "utf8");
  const candles = parseCandles(csv);

  const result = {
    candles,
    from: candles[0]?.nyDate ?? "",
    to: candles[candles.length - 1]?.nyDate ?? ""
  };
  cachedCandles.set(interval, result);

  return result;
}

function groupByDate(candles: IctCandle[]) {
  const groups = new Map<string, IctCandle[]>();

  for (const candle of candles) {
    groups.set(candle.nyDate, [...(groups.get(candle.nyDate) ?? []), candle]);
  }

  return [...groups.entries()].map(([date, dayCandles]) => ({
    date,
    candles: dayCandles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }));
}

function accumulatorKey(day: string, target: string, sweep: string, direction: SweepDirection) {
  return `${day}|${target}|${sweep}|${direction}`;
}

function toRow(accumulator: PatternAccumulator, mode: PatternMode): IctPatternRow {
  const metricSuccesses = mode === "reversal" ? accumulator.reversals : accumulator.continuations;
  const ci = wilson(metricSuccesses, accumulator.n);
  const reversal = accumulator.n ? (accumulator.reversals / accumulator.n) * 100 : 0;
  const continuation = accumulator.n ? (accumulator.continuations / accumulator.n) * 100 : 0;
  const trade =
    mode === "reversal"
      ? accumulator.direction === "LOW"
        ? "LONG (fade)"
        : "SHORT (fade)"
      : accumulator.direction === "LOW"
        ? "SHORT (follow break down)"
        : "LONG (follow break up)";

  return {
    id: accumulatorKey(accumulator.day, accumulator.target, accumulator.sweep, accumulator.direction),
    day: accumulator.day,
    target: accumulator.target,
    sweep: accumulator.sweep,
    direction: accumulator.direction,
    trade,
    n: accumulator.n,
    opportunities: accumulator.opportunities,
    frequency: round((accumulator.n / Math.max(1, accumulator.opportunities)) * 100, 1),
    reversal: round(reversal, 1),
    continuation: round(continuation, 1),
    edge: round(mode === "reversal" ? reversal : continuation, 1),
    ciLow: round(ci.low, 0),
    ciHigh: round(ci.high, 0),
    depth: round(mean(accumulator.depth), 1),
    rejection: round(mean(accumulator.rejection), 1)
  };
}

function buildPatternRows(candles: IctCandle[], filters: Required<IctPatternFilters>) {
  const accumulators = new Map<string, PatternAccumulator>();
  const minDayCandles = filters.interval === "4h" ? 2 : 3;

  for (const day of groupByDate(candles)) {
    if (day.candles.length < minDayCandles) {
      continue;
    }

    for (let targetIndex = 0; targetIndex < day.candles.length - 1; targetIndex += 1) {
      const target = day.candles[targetIndex];

      for (let sweepIndex = targetIndex + 1; sweepIndex < day.candles.length; sweepIndex += 1) {
        const sweep = day.candles[sweepIndex];
        const dayLabel = weekdayLabels[target.weekday] ?? "Unk";
        const baseDirections: SweepDirection[] = ["HIGH", "LOW"];

        for (const direction of baseDirections) {
          const key = accumulatorKey(dayLabel, target.time, sweep.time, direction);
          const existing =
            accumulators.get(key) ??
            ({
              day: dayLabel,
              target: target.time,
              sweep: sweep.time,
              direction,
              n: 0,
              opportunities: 0,
              reversals: 0,
              continuations: 0,
              depth: [],
              rejection: []
            } satisfies PatternAccumulator);

          existing.opportunities += 1;
          accumulators.set(key, existing);
        }

        const highSweep = sweep.high > target.high;
        const lowSweep = sweep.low < target.low;
        const outcomes: SweepDirection[] = [
          ...(highSweep ? (["HIGH"] as const) : []),
          ...(lowSweep ? (["LOW"] as const) : [])
        ];

        for (const direction of outcomes) {
          const key = accumulatorKey(dayLabel, target.time, sweep.time, direction);
          const existing = accumulators.get(key);

          if (!existing) {
            continue;
          }

          existing.n += 1;
          if (direction === "HIGH") {
            const reversed = sweep.close < target.high;
            existing.reversals += reversed ? 1 : 0;
            existing.continuations += reversed ? 0 : 1;
            existing.depth.push(points(sweep.high - target.high));
            existing.rejection.push(points(sweep.high - sweep.close));
          } else {
            const reversed = sweep.close > target.low;
            existing.reversals += reversed ? 1 : 0;
            existing.continuations += reversed ? 0 : 1;
            existing.depth.push(points(target.low - sweep.low));
            existing.rejection.push(points(sweep.close - sweep.low));
          }

          accumulators.set(key, existing);
        }
      }
    }
  }

  return [...accumulators.values()]
    .map((accumulator) => toRow(accumulator, filters.mode))
    .filter((row) => filters.day === "ALL" || row.day.toUpperCase() === filters.day)
    .filter((row) => filters.direction === "BOTH" || row.direction === filters.direction)
    .filter((row) => filters.target === "ALL" || row.target === filters.target)
    .filter((row) => filters.sweep === "ALL" || row.sweep === filters.sweep)
    .filter((row) => row.n >= filters.minN)
    .filter((row) => row.edge >= filters.minEdge)
    .filter((row) => row.ciLow >= filters.minCiLow)
    .sort((a, b) => b.edge - a.edge || b.n - a.n || b.frequency - a.frequency);
}

function summarizeDirection(rows: IctPatternRow[], direction: SweepDirection, mode: PatternMode): DirectionSummary {
  const sample = rows.filter((row) => row.direction === direction);
  const n = sample.reduce((sum, row) => sum + row.n, 0);
  const opportunities = sample.reduce((sum, row) => sum + row.opportunities, 0);
  const reversals = sample.reduce((sum, row) => sum + (row.reversal / 100) * row.n, 0);
  const continuations = sample.reduce((sum, row) => sum + (row.continuation / 100) * row.n, 0);
  const metric = mode === "reversal" ? reversals : continuations;
  const ci = wilson(metric, n);
  const edge = n ? (metric / n) * 100 : 0;

  return {
    direction,
    label: direction === "HIGH" ? "Wicks up - takes high" : "Wicks down - takes low",
    frequencyText: `${round((n / Math.max(1, opportunities)) * 100, 0)}% of matching chances`,
    reversal: round(n ? (reversals / n) * 100 : 0, 1),
    continuation: round(n ? (continuations / n) * 100 : 0, 1),
    ci: `[${round(ci.low, 0)}-${round(ci.high, 0)}]`,
    averageDepth: round(mean(sample.map((row) => row.depth)), 1),
    averageRejection: round(mean(sample.map((row) => row.rejection)), 1),
    action:
      direction === "HIGH"
        ? mode === "reversal"
          ? `SHORT - FADE HIGH SWEEP - ${round(edge, 0)}%`
          : `LONG - FOLLOW BREAK UP - ${round(edge, 0)}%`
        : mode === "reversal"
          ? `LONG - FADE LOW SWEEP - ${round(edge, 0)}%`
          : `SHORT - FOLLOW BREAK DOWN - ${round(edge, 0)}%`,
    manipulation:
      direction === "HIGH"
        ? "High taken before expansion"
        : "Low taken before expansion"
  };
}

function applyDateRange(candles: IctCandle[], from: string, to: string) {
  return candles.filter((candle) => candle.nyDate >= from && candle.nyDate <= to);
}

function applySessionRange(candles: IctCandle[], session: IctSession) {
  if (session === "ALL") {
    return candles;
  }

  const sessionRange = sessionMeta[session];

  return candles.filter((candle) => candle.time >= sessionRange.start && candle.time <= sessionRange.end);
}

function rowSweepsInSession(row: IctPatternRow, session: IctSession) {
  if (session === "ALL") {
    return true;
  }

  const sessionRange = sessionMeta[session];

  return row.sweep >= sessionRange.start && row.sweep <= sessionRange.end;
}

function addClockMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;

  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function displayAvailableEnd(candles: IctCandle[], interval: IctInterval) {
  const latest = candles.reduce((value, candle) => (candle.time > value ? candle.time : value), "");

  if (!latest) {
    return "";
  }

  const hasExtended = candles.some((candle) => candle.time > "16:00");

  if (!hasExtended && latest >= "13:30") {
    return "16:00";
  }

  if (!hasExtended && latest === "11:45") {
    return "12:00";
  }

  return interval === "15min" ? addClockMinutes(latest, 15) : latest;
}

function normalizeInterval(interval?: string): IctInterval {
  return interval === "1h" || interval === "4h" ? interval : "15min";
}

function normalizeSession(session?: string): IctSession {
  return session === "AM" || session === "PM" ? session : "ALL";
}

function normalizeTimeFilter(time?: string) {
  return time && /^\d{2}:\d{2}$/.test(time) ? time : "ALL";
}

function normalizeFilters(filters: IctPatternFilters, defaults: { from: string; to: string }): Required<IctPatternFilters> {
  const mode = filters.mode === "continuation" ? "continuation" : "reversal";
  const direction = filters.direction === "HIGH" || filters.direction === "LOW" ? filters.direction : "BOTH";
  const day = filters.day?.toUpperCase() ?? "ALL";
  const interval = normalizeInterval(filters.interval);
  const session = normalizeSession(filters.session);

  return {
    mode,
    interval,
    session,
    direction,
    day: ["ALL", "MON", "TUE", "WED", "THU", "FRI"].includes(day) ? day : "ALL",
    target: normalizeTimeFilter(filters.target),
    sweep: normalizeTimeFilter(filters.sweep),
    minN: Math.max(1, Number(filters.minN ?? 10)),
    minEdge: clamp(Number(filters.minEdge ?? 50), 0, 100),
    minCiLow: clamp(Number(filters.minCiLow ?? 0), 0, 100),
    from: filters.from ?? defaults.from,
    to: filters.to ?? defaults.to
  };
}

export async function getIctPatternMap(filters: IctPatternFilters = {}) {
  const interval = normalizeInterval(filters.interval);
  const loaded = await loadCandles(interval);
  const normalized = normalizeFilters(filters, { from: loaded.from, to: loaded.to });
  const dateCandles = applyDateRange(loaded.candles, normalized.from, normalized.to);
  const sessionCandles = applySessionRange(dateCandles, normalized.session);
  const rows = buildPatternRows(dateCandles, normalized).filter((row) => rowSweepsInSession(row, normalized.session));
  const visibleRows = rows.slice(0, 120);
  const topEdge = visibleRows[0] ?? null;
  const weightedNumerator = visibleRows.reduce((sum, row) => sum + (row.edge / 100) * row.n, 0);
  const weightedDenominator = visibleRows.reduce((sum, row) => sum + row.n, 0);
  const allEvents = rows.reduce((sum, row) => sum + row.n, 0);

  return {
    meta: {
      title: `PROJECTX NDX ${intervalMeta[normalized.interval].label} ICT Pattern Map`,
      subtitle: `Nasdaq 100 Index ${intervalMeta[normalized.interval].label} sweep map - New York local time`,
      timezone: NY_TIME_ZONE,
      interval: normalized.interval,
      intervalLabel: intervalMeta[normalized.interval].label,
      session: normalized.session,
      sessionLabel: sessionMeta[normalized.session].label,
      sessionStart: sessionMeta[normalized.session].start,
      sessionEnd: sessionMeta[normalized.session].end,
      availableEnd: displayAvailableEnd(sessionCandles, normalized.interval),
      mode: normalized.mode,
      from: normalized.from,
      to: normalized.to,
      totalCandles: sessionCandles.length,
      tradingDays: groupByDate(sessionCandles).length,
      sweepEvents: allEvents,
      provider: "Yahoo Finance chart endpoint",
      symbol: "^NDX",
      exchange: "Nasdaq GIDS",
      micCode: "NIM"
    },
    filters: normalized,
    summary: {
      patterns: visibleRows.length,
      sweepEvents: allEvents,
      weightedEdge: round(weightedDenominator ? (weightedNumerator / weightedDenominator) * 100 : 0, 1),
      topEdge
    },
    directionSummaries: [
      summarizeDirection(rows, "HIGH", normalized.mode),
      summarizeDirection(rows, "LOW", normalized.mode)
    ],
    watchlist: visibleRows.slice(0, 8),
    rows: visibleRows
  };
}
