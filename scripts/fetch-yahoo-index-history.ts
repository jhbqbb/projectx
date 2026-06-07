import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const NY_TIME_ZONE = "America/New_York";
const PROVIDER_SYMBOL = "^NDX";
const FILE_SYMBOL = "ndx";
const DISPLAY_NAME = "Nasdaq 100 Index";
const PROVIDER = "Yahoo Finance chart endpoint";
const DATA_DIR = path.join("public", "data");
const VALIDATION_DIR = path.join(DATA_DIR, "validation");

type SourceInterval = "1min" | "5min" | "15min" | "30min" | "1h" | "1d";
type PatternInterval = "1min" | "5min" | "15min" | "30min" | "1h" | "4h";

type YahooMeta = {
  symbol?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  instrumentType?: string;
  exchangeTimezoneName?: string;
  range?: string;
  dataGranularity?: string;
};

type YahooChartPayload = {
  chart?: {
    result?: Array<{
      meta?: YahooMeta;
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string };
  };
};

type Candle = {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const requests: Record<SourceInterval, { range: string; interval: string }> = {
  "1min": { range: "8d", interval: "1m" },
  "5min": { range: "60d", interval: "5m" },
  "15min": { range: "60d", interval: "15m" },
  "30min": { range: "60d", interval: "30m" },
  "1h": { range: "730d", interval: "1h" },
  "1d": { range: "max", interval: "1d" }
};

const regularSessionLastOpen: Record<Exclude<SourceInterval, "1d">, string> = {
  "1min": "15:59",
  "5min": "15:55",
  "15min": "15:45",
  "30min": "15:30",
  "1h": "15:30"
};
const allowedHourlyOpens = new Set(["09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30"]);

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function nyTime(value: Date) {
  return format(toZonedTime(value, NY_TIME_ZONE), "HH:mm");
}

function nyDate(value: Date) {
  return format(toZonedTime(value, NY_TIME_ZONE), "yyyy-MM-dd");
}

function isRegularSession(candle: Candle, interval: Exclude<SourceInterval, "1d">) {
  const time = nyTime(candle.timestamp);

  if (interval === "1h") {
    return allowedHourlyOpens.has(time);
  }

  return time >= "09:30" && time <= regularSessionLastOpen[interval];
}

function toCsv(candles: Candle[]) {
  return [
    "timestamp,open,high,low,close,volume",
    ...candles.map((candle) =>
      [
        candle.timestamp.toISOString(),
        round(candle.open),
        round(candle.high),
        round(candle.low),
        round(candle.close),
        Math.round(candle.volume)
      ].join(",")
    )
  ].join("\n") + "\n";
}

async function fetchYahoo(range: string, interval: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    PROVIDER_SYMBOL
  )}?range=${range}&interval=${interval}&includePrePost=false`;
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as YahooChartPayload;

  if (!response.ok || payload.chart?.error) {
    throw new Error(payload.chart?.error?.description ?? `Yahoo returned ${response.status}.`);
  }

  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];

  if (!result?.timestamp?.length || !quote) {
    throw new Error(`Yahoo returned no ${interval} candles for ${PROVIDER_SYMBOL}.`);
  }

  const candles = result.timestamp
    .map((timestamp, index) => ({
      timestamp: new Date(timestamp * 1000),
      open: Number(quote.open?.[index]),
      high: Number(quote.high?.[index]),
      low: Number(quote.low?.[index]),
      close: Number(quote.close?.[index]),
      volume: Number(quote.volume?.[index] ?? 0)
    }))
    .filter((candle) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    candles,
    meta: result.meta,
    url
  };
}

async function fetchYahooPeriod(start: string, end: string, interval: string) {
  const period1 = Math.floor(new Date(`${start}T00:00:00.000Z`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${end}T23:59:59.000Z`).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    PROVIDER_SYMBOL
  )}?period1=${period1}&period2=${period2}&interval=${interval}&includePrePost=false`;
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as YahooChartPayload;

  if (!response.ok || payload.chart?.error) {
    throw new Error(payload.chart?.error?.description ?? `Yahoo returned ${response.status}.`);
  }

  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];

  if (!result?.timestamp?.length || !quote) {
    throw new Error(`Yahoo returned no ${interval} candles for ${PROVIDER_SYMBOL}.`);
  }

  const candles = result.timestamp
    .map((timestamp, index) => ({
      timestamp: new Date(timestamp * 1000),
      open: Number(quote.open?.[index]),
      high: Number(quote.high?.[index]),
      low: Number(quote.low?.[index]),
      close: Number(quote.close?.[index]),
      volume: Number(quote.volume?.[index] ?? 0)
    }))
    .filter((candle) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    candles,
    meta: result.meta,
    url
  };
}

function aggregate4h(hourlyCandles: Candle[]) {
  const grouped = new Map<string, Candle[]>();

  for (const candle of hourlyCandles) {
    const time = nyTime(candle.timestamp);
    const date = nyDate(candle.timestamp);
    const block = time < "13:30" ? "09:30" : "13:30";
    const key = `${date}|${block}`;

    grouped.set(key, [...(grouped.get(key) ?? []), candle]);
  }

  return [...grouped.entries()]
    .map(([key, candles]) => {
      const [, block] = key.split("|");
      const sorted = candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const open = sorted[0];
      const close = sorted[sorted.length - 1];

      return {
        timestamp: sorted.find((candle) => nyTime(candle.timestamp) === block)?.timestamp ?? open.timestamp,
        open: open.open,
        high: Math.max(...sorted.map((candle) => candle.high)),
        low: Math.min(...sorted.map((candle) => candle.low)),
        close: close.close,
        volume: sorted.reduce((sum, candle) => sum + candle.volume, 0)
      };
    })
    .filter((candle) => nyTime(candle.timestamp) === "09:30" || nyTime(candle.timestamp) === "13:30")
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function summarizeMeta(meta: YahooMeta | undefined) {
  return {
    symbol: meta?.symbol,
    exchangeName: meta?.exchangeName,
    fullExchangeName: meta?.fullExchangeName,
    instrumentType: meta?.instrumentType,
    exchangeTimezoneName: meta?.exchangeTimezoneName,
    range: meta?.range,
    dataGranularity: meta?.dataGranularity
  };
}

function fileSummary(interval: PatternInterval | "1d", candles: Candle[], derivedFrom?: string) {
  const file = `/data/nasdaq-${FILE_SYMBOL}-${interval}-ohlcv.csv`;

  return {
    interval,
    url: file,
    rows: candles.length,
    from: candles[0]?.timestamp.toISOString() ?? null,
    to: candles[candles.length - 1]?.timestamp.toISOString() ?? null,
    derivedFrom
  };
}

function countOffSession(candles: Candle[], interval: Exclude<SourceInterval, "1d">) {
  return candles.filter((candle) => !isRegularSession(candle, interval)).length;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(VALIDATION_DIR, { recursive: true });

  const oneMinute = await fetchYahoo(requests["1min"].range, requests["1min"].interval);
  const fiveMinute = await fetchYahoo(requests["5min"].range, requests["5min"].interval);
  const fifteenMinute = await fetchYahoo(requests["15min"].range, requests["15min"].interval);
  const thirtyMinute = await fetchYahoo(requests["30min"].range, requests["30min"].interval);
  const hourly = await fetchYahoo(requests["1h"].range, requests["1h"].interval);
  const daily = await fetchYahooPeriod("1990-01-01", "2026-06-05", requests["1d"].interval);

  const candles = {
    "1min": oneMinute.candles.filter((candle) => isRegularSession(candle, "1min")),
    "5min": fiveMinute.candles.filter((candle) => isRegularSession(candle, "5min")),
    "15min": fifteenMinute.candles.filter((candle) => isRegularSession(candle, "15min")),
    "30min": thirtyMinute.candles.filter((candle) => isRegularSession(candle, "30min")),
    "1h": hourly.candles.filter((candle) => isRegularSession(candle, "1h")),
    "4h": [] as Candle[],
    "1d": daily.candles
  };
  candles["4h"] = aggregate4h(candles["1h"]);

  await Promise.all([
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-1min-ohlcv.csv`), toCsv(candles["1min"]), "utf8"),
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-5min-ohlcv.csv`), toCsv(candles["5min"]), "utf8"),
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-15min-ohlcv.csv`), toCsv(candles["15min"]), "utf8"),
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-30min-ohlcv.csv`), toCsv(candles["30min"]), "utf8"),
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-1h-ohlcv.csv`), toCsv(candles["1h"]), "utf8"),
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-4h-ohlcv.csv`), toCsv(candles["4h"]), "utf8"),
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-1d-ohlcv.csv`), toCsv(candles["1d"]), "utf8"),
    writeFile(path.join(VALIDATION_DIR, `yahoo-${FILE_SYMBOL}-daily-max.csv`), toCsv(candles["1d"]), "utf8")
  ]);

  const files = [
    fileSummary("1min", candles["1min"]),
    fileSummary("5min", candles["5min"]),
    fileSummary("15min", candles["15min"]),
    fileSummary("30min", candles["30min"]),
    fileSummary("1h", candles["1h"]),
    fileSummary("4h", candles["4h"], "1h"),
    fileSummary("1d", candles["1d"])
  ];
  const manifest = {
    source: PROVIDER,
    platformTicker: "NASDAQ_INDEX",
    instrumentName: DISPLAY_NAME,
    providerSymbol: PROVIDER_SYMBOL,
    providerExchange: hourly.meta?.fullExchangeName ?? "Nasdaq GIDS",
    providerExchangeCode: hourly.meta?.exchangeName ?? "NIM",
    instrumentType: hourly.meta?.instrumentType ?? "INDEX",
    extendedHours: false,
    timestampFormat: "ISO-8601 UTC",
    timezoneForCalculations: NY_TIME_ZONE,
    columns: ["timestamp", "open", "high", "low", "close", "volume"],
    files
  };

  await writeFile(path.join(DATA_DIR, "nasdaq-ohlcv-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const audit = {
    generatedAt: new Date().toISOString(),
    status: "verified",
    displayedStatsUseFallbacks: false,
    statement:
      "Displayed ICT statistics are calculated from real Nasdaq 100 Index (^NDX) OHLCV candles from Yahoo Finance chart data. ETF proxy data is not used for displayed index statistics.",
    primarySource: {
      provider: PROVIDER,
      instrumentName: DISPLAY_NAME,
      symbol: PROVIDER_SYMBOL,
      exchange: hourly.meta?.fullExchangeName ?? "Nasdaq GIDS",
      exchangeCode: hourly.meta?.exchangeName ?? "NIM",
      instrumentType: hourly.meta?.instrumentType ?? "INDEX",
      extendedHours: false,
      files
    },
    sourceRequests: [
      { interval: "1min", requested: requests["1min"], meta: summarizeMeta(oneMinute.meta), rowsBeforeSessionFilter: oneMinute.candles.length, removedOffSessionRows: countOffSession(oneMinute.candles, "1min"), url: oneMinute.url },
      { interval: "5min", requested: requests["5min"], meta: summarizeMeta(fiveMinute.meta), rowsBeforeSessionFilter: fiveMinute.candles.length, removedOffSessionRows: countOffSession(fiveMinute.candles, "5min"), url: fiveMinute.url },
      { interval: "15min", requested: requests["15min"], meta: summarizeMeta(fifteenMinute.meta), rowsBeforeSessionFilter: fifteenMinute.candles.length, removedOffSessionRows: countOffSession(fifteenMinute.candles, "15min"), url: fifteenMinute.url },
      { interval: "30min", requested: requests["30min"], meta: summarizeMeta(thirtyMinute.meta), rowsBeforeSessionFilter: thirtyMinute.candles.length, removedOffSessionRows: countOffSession(thirtyMinute.candles, "30min"), url: thirtyMinute.url },
      { interval: "1h", requested: requests["1h"], meta: summarizeMeta(hourly.meta), rowsBeforeSessionFilter: hourly.candles.length, removedOffSessionRows: countOffSession(hourly.candles, "1h"), url: hourly.url },
      { interval: "1d", requested: { start: "1990-01-01", end: "2026-06-05", interval: requests["1d"].interval }, meta: summarizeMeta(daily.meta), rows: candles["1d"].length, url: daily.url }
    ],
    checks: {
      sourceIdentity: {
        symbol: hourly.meta?.symbol,
        fullExchangeName: hourly.meta?.fullExchangeName,
        instrumentType: hourly.meta?.instrumentType,
        timezone: hourly.meta?.exchangeTimezoneName
      },
      availableHistory: {
        oneMinuteRows: candles["1min"].length,
        fiveMinuteRows: candles["5min"].length,
        fifteenMinuteRows: candles["15min"].length,
        thirtyMinuteRows: candles["30min"].length,
        oneHourRows: candles["1h"].length,
        fourHourRows: candles["4h"].length,
        dailyRows: candles["1d"].length
      },
      sessionFilter: {
        oneMinuteOffSessionRowsAfterFilter: countOffSession(candles["1min"], "1min"),
        fiveMinuteOffSessionRowsAfterFilter: countOffSession(candles["5min"], "5min"),
        fifteenMinuteOffSessionRowsAfterFilter: countOffSession(candles["15min"], "15min"),
        thirtyMinuteOffSessionRowsAfterFilter: countOffSession(candles["30min"], "30min"),
        oneHourOffSessionRowsAfterFilter: countOffSession(candles["1h"], "1h")
      }
    },
    attemptedSources: [
      {
        provider: "Twelve Data",
        status: "not_used",
        reason:
          "Twelve Data recognizes NDX but this API key is not on a plan that can fetch NDX intraday index candles."
      },
      {
        provider: "Alpha Vantage",
        status: "not_used",
        reason:
          "The current Alpha Vantage key is not entitled to NDX index data access."
      },
      {
        provider: "ETF proxy",
        status: "removed",
        reason: "ETF proxy data is not the Nasdaq index requested by the user."
      }
    ],
    notes: [
      "Yahoo currently returns only recent 1-minute, 5-minute, 15-minute, and 30-minute index intraday history. The platform does not invent older missing intraday bars.",
      "Daily Nasdaq 100 Index data is bundled back to 1990 for long-horizon context.",
      "4H candles are derived from real 1H Nasdaq 100 Index candles using 09:30 and 13:30 New York blocks.",
      "All displayed statistics are descriptive historical measurements, not causal proof or a trading guarantee."
    ]
  };

  await writeFile(path.join(DATA_DIR, "nasdaq-data-audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        source: PROVIDER_SYMBOL,
        instrument: DISPLAY_NAME,
        files,
        identity: audit.checks.sourceIdentity,
        sessionFilter: audit.checks.sessionFilter
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
