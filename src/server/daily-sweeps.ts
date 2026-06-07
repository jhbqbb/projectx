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

type Candle = {
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

type DailyCandle = Candle;

type SweepDirection = "HIGH" | "LOW";
type PatternMode = "reversal" | "continuation";
type IctInterval = "5min" | "15min" | "30min" | "1h" | "4h";
type IctSession = "ALL" | "AM" | "PM";

export type DailySweepFilters = {
  mode?: PatternMode;
  interval?: IctInterval;
  session?: IctSession;
  day?: string;
  direction?: "BOTH" | SweepDirection;
  sweep?: string;
  minN?: number;
  minEdge?: number;
  from?: string;
  to?: string;
};

export type DailySweepRow = {
  id: string;
  day: string;
  level: "PDH" | "PDL";
  sweep: string;
  direction: SweepDirection;
  trade: string;
  n: number;
  opportunities: number;
  frequency: number;
  reversal: number;
  continuation: number;
  edge: number;
  depth: number;
  rejection: number;
};

type Accumulator = {
  day: string;
  level: "PDH" | "PDL";
  sweep: string;
  direction: SweepDirection;
  n: number;
  opportunities: number;
  reversals: number;
  continuations: number;
  depth: number[];
  rejection: number[];
};

type DirectionStats = {
  direction: SweepDirection;
  opportunities: number;
  sweeps: number;
  reversals: number;
  continuations: number;
  depth: number[];
  rejection: number[];
};

type DailyAllTimeStats = {
  opportunities: number;
  highSweeps: number;
  lowSweeps: number;
  bothSweeps: number;
  highReversals: number;
  lowReversals: number;
  highDepth: number[];
  lowDepth: number[];
  highRejection: number[];
  lowRejection: number[];
};

const cachedIntraday = new Map<IctInterval, { candles: Candle[]; from: string; to: string }>();
let cachedDaily: { candles: DailyCandle[]; from: string; to: string } | null = null;

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const intervalMeta: Record<IctInterval, { label: string; file: string }> = {
  "5min": { label: "5M", file: "nasdaq-ndx-5min-ohlcv.csv" },
  "15min": { label: "15M", file: "nasdaq-ndx-15min-ohlcv.csv" },
  "30min": { label: "30M", file: "nasdaq-ndx-30min-ohlcv.csv" },
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
  return value;
}

function parseCandles(csv: string): Candle[] {
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

async function loadIntraday(interval: IctInterval) {
  const cached = cachedIntraday.get(interval);

  if (cached) {
    return cached;
  }

  const csv = await readFile(path.join(process.cwd(), "public", "data", intervalMeta[interval].file), "utf8");
  const candles = parseCandles(csv);
  const result = {
    candles,
    from: candles[0]?.nyDate ?? "",
    to: candles[candles.length - 1]?.nyDate ?? ""
  };
  cachedIntraday.set(interval, result);

  return result;
}

async function loadDaily() {
  if (cachedDaily) {
    return cachedDaily;
  }

  const csv = await readFile(path.join(process.cwd(), "public", "data", "nasdaq-ndx-1d-ohlcv.csv"), "utf8");
  const candles = parseCandles(csv);
  cachedDaily = {
    candles,
    from: candles[0]?.nyDate ?? "",
    to: candles[candles.length - 1]?.nyDate ?? ""
  };

  return cachedDaily;
}

function groupByDate(candles: Candle[]) {
  const groups = new Map<string, Candle[]>();

  for (const candle of candles) {
    groups.set(candle.nyDate, [...(groups.get(candle.nyDate) ?? []), candle]);
  }

  return [...groups.entries()].map(([date, dayCandles]) => ({
    date,
    candles: dayCandles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }));
}

function previousDailyByDate(daily: DailyCandle[]) {
  const previous = new Map<string, DailyCandle>();

  for (let index = 1; index < daily.length; index += 1) {
    previous.set(daily[index].nyDate, daily[index - 1]);
  }

  return previous;
}

function applyDateRange(candles: Candle[], from: string, to: string) {
  return candles.filter((candle) => candle.nyDate >= from && candle.nyDate <= to);
}

function applySessionRange(candles: Candle[], session: IctSession) {
  if (session === "ALL") {
    return candles;
  }

  const sessionRange = sessionMeta[session];

  return candles.filter((candle) => candle.time >= sessionRange.start && candle.time <= sessionRange.end);
}

function key(day: string, level: "PDH" | "PDL", sweep: string, direction: SweepDirection) {
  return `${day}|${level}|${sweep}|${direction}`;
}

function toRow(accumulator: Accumulator, mode: PatternMode): DailySweepRow {
  const reversal = accumulator.n ? (accumulator.reversals / accumulator.n) * 100 : 0;
  const continuation = accumulator.n ? (accumulator.continuations / accumulator.n) * 100 : 0;
  const trade =
    mode === "reversal"
      ? accumulator.direction === "LOW"
        ? "LONG (fade PDL)"
        : "SHORT (fade PDH)"
      : accumulator.direction === "LOW"
        ? "SHORT (accept below PDL)"
        : "LONG (accept above PDH)";

  return {
    id: key(accumulator.day, accumulator.level, accumulator.sweep, accumulator.direction),
    day: accumulator.day,
    level: accumulator.level,
    sweep: accumulator.sweep,
    direction: accumulator.direction,
    trade,
    n: accumulator.n,
    opportunities: accumulator.opportunities,
    frequency: round((accumulator.n / Math.max(1, accumulator.opportunities)) * 100, 1),
    reversal: round(reversal, 1),
    continuation: round(continuation, 1),
    edge: round(mode === "reversal" ? reversal : continuation, 1),
    depth: round(mean(accumulator.depth), 1),
    rejection: round(mean(accumulator.rejection), 1)
  };
}

function emptyDirectionStats(direction: SweepDirection): DirectionStats {
  return {
    direction,
    opportunities: 0,
    sweeps: 0,
    reversals: 0,
    continuations: 0,
    depth: [],
    rejection: []
  };
}

function updateDirectionStats(stats: DirectionStats, candle: Candle, previous: DailyCandle) {
  stats.sweeps += 1;

  if (stats.direction === "HIGH") {
    const reversed = candle.close < previous.high;
    stats.reversals += reversed ? 1 : 0;
    stats.continuations += reversed ? 0 : 1;
    stats.depth.push(points(candle.high - previous.high));
    stats.rejection.push(points(candle.high - candle.close));
  } else {
    const reversed = candle.close > previous.low;
    stats.reversals += reversed ? 1 : 0;
    stats.continuations += reversed ? 0 : 1;
    stats.depth.push(points(previous.low - candle.low));
    stats.rejection.push(points(candle.close - candle.low));
  }
}

function buildRows(params: {
  intraday: Candle[];
  daily: DailyCandle[];
  filters: Required<DailySweepFilters>;
}) {
  const accumulators = new Map<string, Accumulator>();
  const previousByDate = previousDailyByDate(params.daily);
  const highStats = emptyDirectionStats("HIGH");
  const lowStats = emptyDirectionStats("LOW");

  for (const day of groupByDate(params.intraday)) {
    const previous = previousByDate.get(day.date);

    if (!previous) {
      continue;
    }

    const dayLabel = weekdayLabels[day.candles[0]?.weekday ?? 0] ?? "Unk";

    if (params.filters.day !== "ALL" && dayLabel.toUpperCase() !== params.filters.day) {
      continue;
    }

    const sessionCandles = applySessionRange(day.candles, params.filters.session);

    if (!sessionCandles.length) {
      continue;
    }

    highStats.opportunities += 1;
    lowStats.opportunities += 1;

    for (const candle of sessionCandles) {
      const base = [
        { level: "PDH" as const, direction: "HIGH" as const },
        { level: "PDL" as const, direction: "LOW" as const }
      ];

      for (const item of base) {
        const accumulatorKey = key(dayLabel, item.level, candle.time, item.direction);
        const existing =
          accumulators.get(accumulatorKey) ??
          ({
            day: dayLabel,
            level: item.level,
            sweep: candle.time,
            direction: item.direction,
            n: 0,
            opportunities: 0,
            reversals: 0,
            continuations: 0,
            depth: [],
            rejection: []
          } satisfies Accumulator);

        existing.opportunities += 1;
        accumulators.set(accumulatorKey, existing);
      }
    }

    const firstHighSweep = sessionCandles.find((candle) => candle.high > previous.high);
    const firstLowSweep = sessionCandles.find((candle) => candle.low < previous.low);

    if (firstHighSweep) {
      const accumulator = accumulators.get(key(dayLabel, "PDH", firstHighSweep.time, "HIGH"));

      if (accumulator) {
        const reversed = firstHighSweep.close < previous.high;
        accumulator.n += 1;
        accumulator.reversals += reversed ? 1 : 0;
        accumulator.continuations += reversed ? 0 : 1;
        accumulator.depth.push(points(firstHighSweep.high - previous.high));
        accumulator.rejection.push(points(firstHighSweep.high - firstHighSweep.close));
      }

      updateDirectionStats(highStats, firstHighSweep, previous);
    }

    if (firstLowSweep) {
      const accumulator = accumulators.get(key(dayLabel, "PDL", firstLowSweep.time, "LOW"));

      if (accumulator) {
        const reversed = firstLowSweep.close > previous.low;
        accumulator.n += 1;
        accumulator.reversals += reversed ? 1 : 0;
        accumulator.continuations += reversed ? 0 : 1;
        accumulator.depth.push(points(previous.low - firstLowSweep.low));
        accumulator.rejection.push(points(firstLowSweep.close - firstLowSweep.low));
      }

      updateDirectionStats(lowStats, firstLowSweep, previous);
    }
  }

  const rows = [...accumulators.values()]
    .map((accumulator) => toRow(accumulator, params.filters.mode))
    .filter((row) => params.filters.direction === "BOTH" || row.direction === params.filters.direction)
    .filter((row) => params.filters.sweep === "ALL" || row.sweep === params.filters.sweep)
    .filter((row) => row.n >= params.filters.minN)
    .filter((row) => row.edge >= params.filters.minEdge)
    .sort((a, b) => b.edge - a.edge || b.n - a.n || b.frequency - a.frequency);

  return {
    rows,
    directionStats: [highStats, lowStats]
  };
}

function summarizeDirection(stats: DirectionStats, mode: PatternMode) {
  const edgeSuccesses = mode === "reversal" ? stats.reversals : stats.continuations;
  const edge = stats.sweeps ? (edgeSuccesses / stats.sweeps) * 100 : 0;

  return {
    direction: stats.direction,
    label: stats.direction === "HIGH" ? "Previous day high swept" : "Previous day low swept",
    frequency: round((stats.sweeps / Math.max(1, stats.opportunities)) * 100, 1),
    reversal: round(stats.sweeps ? (stats.reversals / stats.sweeps) * 100 : 0, 1),
    continuation: round(stats.sweeps ? (stats.continuations / stats.sweeps) * 100 : 0, 1),
    edge: round(edge, 1),
    averageDepth: round(mean(stats.depth), 1),
    averageRejection: round(mean(stats.rejection), 1),
    action:
      stats.direction === "HIGH"
        ? mode === "reversal"
          ? `SHORT - FADE PDH SWEEP - ${round(edge, 0)}%`
          : `LONG - ACCEPT ABOVE PDH - ${round(edge, 0)}%`
        : mode === "reversal"
          ? `LONG - FADE PDL SWEEP - ${round(edge, 0)}%`
          : `SHORT - ACCEPT BELOW PDL - ${round(edge, 0)}%`
  };
}

function summarizeDailyAllTime(daily: DailyCandle[]) {
  const stats: DailyAllTimeStats = {
    opportunities: 0,
    highSweeps: 0,
    lowSweeps: 0,
    bothSweeps: 0,
    highReversals: 0,
    lowReversals: 0,
    highDepth: [],
    lowDepth: [],
    highRejection: [],
    lowRejection: []
  };

  for (let index = 1; index < daily.length; index += 1) {
    const previous = daily[index - 1];
    const current = daily[index];
    const highSweep = current.high > previous.high;
    const lowSweep = current.low < previous.low;

    stats.opportunities += 1;
    stats.highSweeps += highSweep ? 1 : 0;
    stats.lowSweeps += lowSweep ? 1 : 0;
    stats.bothSweeps += highSweep && lowSweep ? 1 : 0;

    if (highSweep) {
      const reversed = current.close < previous.high;
      stats.highReversals += reversed ? 1 : 0;
      stats.highDepth.push(points(current.high - previous.high));
      stats.highRejection.push(points(current.high - current.close));
    }

    if (lowSweep) {
      const reversed = current.close > previous.low;
      stats.lowReversals += reversed ? 1 : 0;
      stats.lowDepth.push(points(previous.low - current.low));
      stats.lowRejection.push(points(current.close - current.low));
    }
  }

  return {
    opportunities: stats.opportunities,
    highSweepFrequency: round((stats.highSweeps / Math.max(1, stats.opportunities)) * 100, 1),
    lowSweepFrequency: round((stats.lowSweeps / Math.max(1, stats.opportunities)) * 100, 1),
    bothSidesFrequency: round((stats.bothSweeps / Math.max(1, stats.opportunities)) * 100, 1),
    highSweepReversal: round((stats.highReversals / Math.max(1, stats.highSweeps)) * 100, 1),
    lowSweepReversal: round((stats.lowReversals / Math.max(1, stats.lowSweeps)) * 100, 1),
    highSweepContinuation: round(((stats.highSweeps - stats.highReversals) / Math.max(1, stats.highSweeps)) * 100, 1),
    lowSweepContinuation: round(((stats.lowSweeps - stats.lowReversals) / Math.max(1, stats.lowSweeps)) * 100, 1),
    averageHighSweepDepth: round(mean(stats.highDepth), 1),
    averageLowSweepDepth: round(mean(stats.lowDepth), 1),
    averageHighSweepRejection: round(mean(stats.highRejection), 1),
    averageLowSweepRejection: round(mean(stats.lowRejection), 1)
  };
}

function normalizeInterval(interval?: string): IctInterval {
  return interval === "5min" || interval === "30min" || interval === "1h" || interval === "4h"
    ? interval
    : "15min";
}

function normalizeSession(session?: string): IctSession {
  return session === "AM" || session === "PM" ? session : "ALL";
}

function normalizeDirection(direction?: string): "BOTH" | SweepDirection {
  return direction === "HIGH" || direction === "LOW" ? direction : "BOTH";
}

function normalizeDay(day?: string) {
  const normalized = day?.toUpperCase() ?? "ALL";

  return ["ALL", "MON", "TUE", "WED", "THU", "FRI"].includes(normalized) ? normalized : "ALL";
}

function normalizeTimeFilter(time?: string) {
  return time && /^\d{2}:\d{2}$/.test(time) ? time : "ALL";
}

function normalizeFilters(filters: DailySweepFilters, defaults: { from: string; to: string }): Required<DailySweepFilters> {
  return {
    mode: filters.mode === "continuation" ? "continuation" : "reversal",
    interval: normalizeInterval(filters.interval),
    session: normalizeSession(filters.session),
    day: normalizeDay(filters.day),
    direction: normalizeDirection(filters.direction),
    sweep: normalizeTimeFilter(filters.sweep),
    minN: Math.max(1, Number(filters.minN ?? 10)),
    minEdge: clamp(Number(filters.minEdge ?? 50), 0, 100),
    from: filters.from ?? defaults.from,
    to: filters.to ?? defaults.to
  };
}

export async function getDailySweepMap(filters: DailySweepFilters = {}) {
  const interval = normalizeInterval(filters.interval);
  const [intraday, daily] = await Promise.all([loadIntraday(interval), loadDaily()]);
  const normalized = normalizeFilters(filters, { from: intraday.from, to: intraday.to });
  const intradayCandles = applyDateRange(intraday.candles, normalized.from, normalized.to);
  const built = buildRows({
    intraday: intradayCandles,
    daily: daily.candles,
    filters: normalized
  });
  const visibleRows = built.rows.slice(0, 80);
  const weightedNumerator = visibleRows.reduce((sum, row) => sum + (row.edge / 100) * row.n, 0);
  const weightedDenominator = visibleRows.reduce((sum, row) => sum + row.n, 0);

  return {
    meta: {
      title: `PROJECTX NDX ${intervalMeta[normalized.interval].label} Daily Level Sweeps`,
      subtitle: "Previous daily high / previous daily low sweep map - New York local time",
      timezone: NY_TIME_ZONE,
      interval: normalized.interval,
      intervalLabel: intervalMeta[normalized.interval].label,
      session: normalized.session,
      sessionLabel: sessionMeta[normalized.session].label,
      mode: normalized.mode,
      from: normalized.from,
      to: normalized.to,
      dailyFrom: daily.from,
      dailyTo: daily.to,
      intradayTradingDays: groupByDate(intradayCandles).length,
      dailyTradingDays: daily.candles.length,
      provider: "Yahoo Finance chart endpoint",
      symbol: "^NDX",
      exchange: "Nasdaq GIDS"
    },
    filters: normalized,
    dailySummary: summarizeDailyAllTime(daily.candles),
    directionSummaries: built.directionStats.map((stats) => summarizeDirection(stats, normalized.mode)),
    summary: {
      patterns: visibleRows.length,
      sweepEvents: built.rows.reduce((sum, row) => sum + row.n, 0),
      weightedEdge: round(weightedDenominator ? (weightedNumerator / weightedDenominator) * 100 : 0, 1),
      topEdge: visibleRows[0] ?? null
    },
    watchlist: visibleRows.slice(0, 6),
    rows: visibleRows
  };
}
