import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const SYMBOL = "QQQ";
const NY_TIME_ZONE = "America/New_York";
const VALIDATION_DIR = path.join("public", "data", "validation");
const DAILY_URL = `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}?range=5y&interval=1d&includePrePost=false`;
const INTRADAY_URL = `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}?range=60d&interval=15m&includePrePost=false`;

type YahooChartPayload = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        exchangeName?: string;
        fullExchangeName?: string;
        instrumentType?: string;
        exchangeTimezoneName?: string;
        range?: string;
        dataGranularity?: string;
      };
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

function nyDate(value: Date) {
  return format(toZonedTime(value, NY_TIME_ZONE), "yyyy-MM-dd");
}

function toCsv(candles: Candle[]) {
  return [
    "timestamp,open,high,low,close,volume",
    ...candles.map((candle) =>
      [
        candle.timestamp.toISOString(),
        round(candle.open, 4),
        round(candle.high, 4),
        round(candle.low, 4),
        round(candle.close, 4),
        Math.round(candle.volume)
      ].join(",")
    )
  ].join("\n") + "\n";
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function fetchYahoo(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as YahooChartPayload;

  if (!response.ok || payload.chart?.error) {
    throw new Error(payload.chart?.error?.description ?? `Yahoo returned ${response.status}.`);
  }

  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];

  if (!result?.timestamp?.length || !quote) {
    throw new Error("Yahoo returned no chart candles.");
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
    meta: result.meta
  };
}

async function readCsv(filePath: string) {
  const csv = await readFile(filePath, "utf8");
  const [, ...rows] = csv.trim().split(/\r?\n/);

  return rows
    .map((row) => {
      const [timestamp, open, high, low, close, volume] = row.split(",");

      return {
        timestamp: new Date(timestamp),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume ?? 0)
      };
    })
    .filter(
      (candle) =>
        !Number.isNaN(candle.timestamp.getTime()) &&
        [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    );
}

function aggregateDailyClose(candles: Candle[]) {
  const daily = new Map<string, Candle>();

  for (const candle of candles) {
    const date = nyDate(candle.timestamp);
    const existing = daily.get(date);

    if (!existing || candle.timestamp > existing.timestamp) {
      daily.set(date, candle);
    }
  }

  return daily;
}

function compareDaily(twelve15m: Candle[], yahooDaily: Candle[]) {
  const twelveDaily = aggregateDailyClose(twelve15m);
  const yahooByDate = new Map(yahooDaily.map((candle) => [nyDate(candle.timestamp), candle]));
  const diffs: number[] = [];
  const examples: Array<{ date: string; twelveClose: number; yahooClose: number; absoluteDiff: number }> = [];

  for (const [date, twelveCandle] of twelveDaily.entries()) {
    const yahooCandle = yahooByDate.get(date);

    if (!yahooCandle) {
      continue;
    }

    const diff = Math.abs(twelveCandle.close - yahooCandle.close);
    diffs.push(diff);

    if (examples.length < 6) {
      examples.push({
        date,
        twelveClose: round(twelveCandle.close, 4),
        yahooClose: round(yahooCandle.close, 4),
        absoluteDiff: round(diff, 4)
      });
    }
  }

  return {
    overlappingDays: diffs.length,
    averageAbsCloseDiff: round(average(diffs), 4),
    maxAbsCloseDiff: round(Math.max(0, ...diffs), 4),
    examples
  };
}

function compareIntraday(twelve15m: Candle[], yahoo15m: Candle[]) {
  const twelveByTimestamp = new Map(twelve15m.map((candle) => [candle.timestamp.getTime(), candle]));
  const diffs: number[] = [];
  const examples: Array<{ timestamp: string; twelveClose: number; yahooClose: number; absoluteDiff: number }> = [];

  for (const yahooCandle of yahoo15m) {
    const twelveCandle = twelveByTimestamp.get(yahooCandle.timestamp.getTime());

    if (!twelveCandle) {
      continue;
    }

    const diff = Math.abs(twelveCandle.close - yahooCandle.close);
    diffs.push(diff);

    if (examples.length < 6) {
      examples.push({
        timestamp: yahooCandle.timestamp.toISOString(),
        twelveClose: round(twelveCandle.close, 4),
        yahooClose: round(yahooCandle.close, 4),
        absoluteDiff: round(diff, 4)
      });
    }
  }

  return {
    matchedBars: diffs.length,
    averageAbsCloseDiff: round(average(diffs), 4),
    maxAbsCloseDiff: round(Math.max(0, ...diffs), 4),
    examples
  };
}

function summarizeYahooMeta(meta: Awaited<ReturnType<typeof fetchYahoo>>["meta"]) {
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

async function main() {
  await mkdir(VALIDATION_DIR, { recursive: true });

  const [manifestRaw, twelve15m, yahooDaily, yahoo15m] = await Promise.all([
    readFile(path.join("public", "data", "nasdaq-ohlcv-manifest.json"), "utf8"),
    readCsv(path.join("public", "data", "nasdaq-qqq-15min-ohlcv.csv")),
    fetchYahoo(DAILY_URL),
    fetchYahoo(INTRADAY_URL)
  ]);
  const manifest = JSON.parse(manifestRaw) as {
    source?: string;
    providerSymbol?: string;
    providerExchange?: string;
    providerMicCode?: string;
    extendedHours?: boolean;
    historyYears?: number;
    requestedHistoryYears?: number;
    files?: Array<{ interval: string; rows: number; from: string; to: string }>;
  };
  const dailyComparison = compareDaily(twelve15m, yahooDaily.candles);
  const intradayComparison = compareIntraday(twelve15m, yahoo15m.candles);
  const verified =
    dailyComparison.overlappingDays >= 200 &&
    dailyComparison.averageAbsCloseDiff <= 0.25 &&
    intradayComparison.matchedBars >= 250 &&
    intradayComparison.averageAbsCloseDiff <= 0.25;

  await Promise.all([
    writeFile(path.join(VALIDATION_DIR, "yahoo-qqq-daily-5y.csv"), toCsv(yahooDaily.candles), "utf8"),
    writeFile(path.join(VALIDATION_DIR, "yahoo-qqq-15m-60d.csv"), toCsv(yahoo15m.candles), "utf8")
  ]);

  await writeFile(
    path.join("public", "data", "nasdaq-data-audit.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        status: verified ? "verified" : "needs_review",
        displayedStatsUseFallbacks: false,
        statement:
          "Displayed ICT statistics are calculated from bundled real QQQ OHLCV candles. Yahoo data is stored separately and used only for cross-source validation.",
        primarySource: {
          provider: manifest.source ?? "Twelve Data",
          symbol: manifest.providerSymbol ?? SYMBOL,
          exchange: manifest.providerExchange ?? "NASDAQ",
          micCode: manifest.providerMicCode ?? "XNMS",
          extendedHours: Boolean(manifest.extendedHours),
          requestedHistoryYears: manifest.requestedHistoryYears ?? manifest.historyYears ?? null,
          files: manifest.files ?? []
        },
        validationSources: [
          {
            provider: "Yahoo Finance chart endpoint",
            purpose: "Daily close cross-check",
            url: DAILY_URL,
            rows: yahooDaily.candles.length,
            meta: summarizeYahooMeta(yahooDaily.meta)
          },
          {
            provider: "Yahoo Finance chart endpoint",
            purpose: "Recent 15-minute close cross-check",
            url: INTRADAY_URL,
            rows: yahoo15m.candles.length,
            meta: summarizeYahooMeta(yahoo15m.meta)
          }
        ],
        attemptedSources: [
          {
            provider: "Stooq",
            status: "not_used",
            reason: "The CSV endpoint returned a browser verification page from this environment instead of OHLCV rows."
          }
        ],
        checks: {
          dailyClose: dailyComparison,
          intraday15mClose: intradayComparison
        },
        notes: [
          "All timestamps are stored as UTC and converted to America/New_York for pattern calculations.",
          "Current bundled bars are regular-session candles. PM calculations therefore use available regular-market candles through 16:00 unless an extended-hours provider plan is enabled.",
          "Statistics are descriptive historical measurements, not causal proof or a trading guarantee."
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        status: verified ? "verified" : "needs_review",
        daily: dailyComparison,
        intraday15m: intradayComparison
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
