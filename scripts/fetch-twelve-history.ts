import { readFile, writeFile } from "node:fs/promises";
import { format, subYears } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

const NY_TIME_ZONE = "America/New_York";
const SYMBOL = "QQQ";
const PLATFORM_TICKER = "NASDAQ";
const OUTPUT_SIZE = 5000;
const REQUEST_DELAY_MS = 8200;
const INCLUDE_PREPOST = process.env.TWELVE_DATA_PREPOST === "true";

type Interval = "1min" | "15min" | "1h" | "4h";

type TwelveDataBar = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
};

type TwelveDataResponse = {
  values?: TwelveDataBar[];
  status?: string;
  code?: number;
  message?: string;
  meta?: {
    symbol?: string;
    exchange?: string;
    mic_code?: string;
    type?: string;
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

const intervals: Array<{ interval: Interval; minutes: number; file: string }> = [
  { interval: "1min", minutes: 1, file: "public/data/nasdaq-qqq-1min-ohlcv.csv" },
  { interval: "15min", minutes: 15, file: "public/data/nasdaq-qqq-15min-ohlcv.csv" },
  { interval: "1h", minutes: 60, file: "public/data/nasdaq-qqq-1h-ohlcv.csv" },
  { interval: "4h", minutes: 240, file: "public/data/nasdaq-qqq-4h-ohlcv.csv" }
];

function requireApiKey() {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY is not configured.");
  }

  return apiKey;
}

function nyToDate(value: string) {
  return fromZonedTime(value.replace(" ", "T"), NY_TIME_ZONE);
}

function dateToNy(value: Date) {
  return format(toZonedTime(value, NY_TIME_ZONE), "yyyy-MM-dd HH:mm:ss");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toCsv(candles: Candle[]) {
  return [
    "timestamp,open,high,low,close,volume",
    ...candles.map((candle) =>
      [
        candle.timestamp.toISOString(),
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume
      ].join(",")
    )
  ].join("\n") + "\n";
}

function parseCandles(values: TwelveDataBar[]) {
  return values
    .map((bar) => ({
      timestamp: nyToDate(bar.datetime),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.volume ?? 0)
    }))
    .filter(
      (candle) =>
        !Number.isNaN(candle.timestamp.getTime()) &&
        [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    );
}

async function fetchPage(apiKey: string, interval: Interval, endDate?: Date) {
  const query = new URLSearchParams({
    symbol: SYMBOL,
    interval,
    outputsize: String(OUTPUT_SIZE),
    timezone: NY_TIME_ZONE,
    order: "ASC",
    apikey: apiKey
  });

  if (INCLUDE_PREPOST) {
    query.set("prepost", "true");
  }

  if (endDate) {
    query.set("end_date", dateToNy(endDate));
  }

  const response = await fetch(`https://api.twelvedata.com/time_series?${query.toString()}`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as TwelveDataResponse;

  if (!response.ok || payload.status === "error" || !payload.values?.length) {
    throw new Error(payload.message ?? `Twelve Data returned ${response.status}.`);
  }

  return {
    candles: parseCandles(payload.values),
    meta: payload.meta
  };
}

async function fetchInterval(apiKey: string, interval: Interval, minutes: number) {
  const allCandles = new Map<number, Candle>();
  let pageEndDate: Date | undefined;
  let targetStart: Date | null = null;
  let meta: TwelveDataResponse["meta"];

  for (let pageIndex = 1; pageIndex <= 80; pageIndex += 1) {
    const page = await fetchPage(apiKey, interval, pageEndDate);

    if (!meta) {
      meta = page.meta;
    }

    const candles = page.candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const first = candles[0]?.timestamp;
    const last = candles[candles.length - 1]?.timestamp;

    if (!first || !last) {
      break;
    }

    if (!targetStart) {
      targetStart = subYears(last, 2);
    }

    for (const candle of candles) {
      if (candle.timestamp >= targetStart && candle.timestamp <= last) {
        allCandles.set(candle.timestamp.getTime(), candle);
      }
    }

    console.log(
      `${interval} page ${pageIndex}: ${candles.length} rows, ${first.toISOString()} -> ${last.toISOString()}`
    );

    if (first <= targetStart) {
      break;
    }

    pageEndDate = new Date(first.getTime() - minutes * 60_000);
    await sleep(REQUEST_DELAY_MS);
  }

  const candles = [...allCandles.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    candles,
    meta
  };
}

async function main() {
  const apiKey = requireApiKey();
  const requestedIntervals = (process.env.ONLY_INTERVALS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const activeIntervals = requestedIntervals.length
    ? intervals.filter((item) => requestedIntervals.includes(item.interval))
    : intervals;
  const existingManifest = await readFile("public/data/nasdaq-ohlcv-manifest.json", "utf8")
    .then((value) => JSON.parse(value) as { files?: Array<{ interval: string }> })
    .catch(() => ({ files: [] }));
  const manifestFiles = new Map<string, unknown>(
    existingManifest.files?.map((file) => [file.interval, file]) ?? []
  );

  for (const item of activeIntervals) {
    const result = await fetchInterval(apiKey, item.interval, item.minutes);

    if (!result.candles.length) {
      throw new Error(`No ${item.interval} candles fetched.`);
    }

    await writeFile(item.file, toCsv(result.candles), "utf8");

    const first = result.candles[0];
    const last = result.candles[result.candles.length - 1];

    manifestFiles.set(item.interval, {
      interval: item.interval,
      url: item.file.replace("public", "").replaceAll("\\", "/"),
      rows: result.candles.length,
      from: first.timestamp.toISOString(),
      to: last.timestamp.toISOString()
    });

    console.log(`${item.file}: wrote ${result.candles.length} rows`);
    console.log(
      `provider meta: ${JSON.stringify({
        symbol: result.meta?.symbol,
        exchange: result.meta?.exchange,
        mic_code: result.meta?.mic_code,
        type: result.meta?.type
      })}`
    );
  }

  await writeFile(
    "public/data/nasdaq-ohlcv-manifest.json",
    `${JSON.stringify(
      {
        source: "Twelve Data",
        platformTicker: PLATFORM_TICKER,
        providerSymbol: SYMBOL,
        providerExchange: "NASDAQ",
        providerMicCode: "XNMS",
        extendedHours: INCLUDE_PREPOST,
        timestampFormat: "ISO-8601 UTC",
        columns: ["timestamp", "open", "high", "low", "close", "volume"],
        files: intervals
          .map((item) => manifestFiles.get(item.interval))
          .filter(Boolean)
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
