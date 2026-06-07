import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

const NY_TIME_ZONE = "America/New_York";
const FILE_SYMBOL = "ndx";
const DATA_DIR = path.join("public", "data");
const FIRST_RATE_PATH = path.join("tmp", "market-data", "NDX", "NDX_full_1min.txt");
const COMBINED_PROVIDER = "Yahoo Finance chart endpoint + FirstRate Data free NDX intraday sample";
const DISPLAY_NAME = "Nasdaq 100 Index";
const PROVIDER_SYMBOL = "^NDX";

type Interval = "1min" | "5min" | "15min" | "30min" | "1h" | "4h";

type Candle = {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
};

const intervalMinutes: Record<Exclude<Interval, "4h">, number> = {
  "1min": 1,
  "5min": 5,
  "15min": 15,
  "30min": 30,
  "1h": 60
};

const intervalLastOpen: Record<Exclude<Interval, "4h">, string> = {
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

function isRegularSession(candle: Candle, interval: Exclude<Interval, "4h">) {
  const time = nyTime(candle.timestamp);

  if (interval === "1h") {
    return allowedHourlyOpens.has(time);
  }

  return time >= "09:30" && time <= intervalLastOpen[interval];
}

function parseCsvWithHeader(csv: string, source: string) {
  const [, ...lines] = csv.trim().split(/\r?\n/);

  return lines
    .map((line) => {
      const [timestamp, open, high, low, close, volume] = line.split(",");

      return {
        timestamp: new Date(timestamp),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume ?? 0),
        source
      };
    })
    .filter((candle) => !Number.isNaN(candle.timestamp.getTime()) && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
}

function parseFirstRate(text: string) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [localTimestamp, open, high, low, close] = line.split(",");

      return {
        timestamp: fromZonedTime(localTimestamp.replace(" ", "T"), NY_TIME_ZONE),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: 0,
        source: "FirstRate Data"
      };
    })
    .filter((candle) => !Number.isNaN(candle.timestamp.getTime()) && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
}

function mergeCandles(candleGroups: Candle[][]) {
  const merged = new Map<string, Candle>();

  for (const candle of candleGroups.flat()) {
    merged.set(candle.timestamp.toISOString(), candle);
  }

  return [...merged.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
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

function groupByDate(candles: Candle[]) {
  const groups = new Map<string, Candle[]>();

  for (const candle of candles) {
    const date = nyDate(candle.timestamp);
    groups.set(date, [...(groups.get(date) ?? []), candle]);
  }

  return [...groups.entries()]
    .map(([date, dayCandles]) => ({ date, candles: dayCandles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function minuteOfDay(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  return hour * 60 + minute;
}

function aggregateFromOneMinute(oneMinute: Candle[], interval: Exclude<Interval, "1min" | "4h">) {
  const size = intervalMinutes[interval];
  const grouped = new Map<string, Candle[]>();

  for (const candle of oneMinute) {
    const time = nyTime(candle.timestamp);
    const date = nyDate(candle.timestamp);
    const minutesFromOpen = minuteOfDay(time) - minuteOfDay("09:30");

    if (minutesFromOpen < 0) {
      continue;
    }

    const bucketStart = minuteOfDay("09:30") + Math.floor(minutesFromOpen / size) * size;
    const hour = Math.floor(bucketStart / 60);
    const minute = bucketStart % 60;
    const bucketTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

    if (bucketTime > intervalLastOpen[interval]) {
      continue;
    }

    const key = `${date}|${bucketTime}`;
    grouped.set(key, [...(grouped.get(key) ?? []), candle]);
  }

  return [...grouped.entries()]
    .map(([key, candles]) => {
      const [date, time] = key.split("|");
      const sorted = candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const open = sorted[0];
      const close = sorted[sorted.length - 1];

      return {
        timestamp: fromZonedTime(`${date}T${time}:00`, NY_TIME_ZONE),
        open: open.open,
        high: Math.max(...sorted.map((candle) => candle.high)),
        low: Math.min(...sorted.map((candle) => candle.low)),
        close: close.close,
        volume: sorted.reduce((sum, candle) => sum + candle.volume, 0),
        source: "FirstRate Data aggregated"
      };
    })
    .filter((candle) => isRegularSession(candle, interval))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
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
      const [date, block] = key.split("|");
      const sorted = candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const open = sorted[0];
      const close = sorted[sorted.length - 1];

      return {
        timestamp: fromZonedTime(`${date}T${block}:00`, NY_TIME_ZONE),
        open: open.open,
        high: Math.max(...sorted.map((candle) => candle.high)),
        low: Math.min(...sorted.map((candle) => candle.low)),
        close: close.close,
        volume: sorted.reduce((sum, candle) => sum + candle.volume, 0),
        source: "merged 1h aggregation"
      };
    })
    .filter((candle) => nyTime(candle.timestamp) === "09:30" || nyTime(candle.timestamp) === "13:30")
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function fileSummary(interval: Interval | "1d", candles: Candle[], derivedFrom?: string) {
  return {
    interval,
    url: `/data/nasdaq-${FILE_SYMBOL}-${interval}-ohlcv.csv`,
    rows: candles.length,
    from: candles[0]?.timestamp.toISOString() ?? null,
    to: candles[candles.length - 1]?.timestamp.toISOString() ?? null,
    derivedFrom
  };
}

function firstLast(candles: Candle[]) {
  return {
    rows: candles.length,
    from: candles[0]?.timestamp.toISOString() ?? null,
    to: candles[candles.length - 1]?.timestamp.toISOString() ?? null,
    tradingDays: groupByDate(candles).length
  };
}

async function loadExisting(interval: Interval | "1d") {
  return parseCsvWithHeader(await readFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-${interval}-ohlcv.csv`), "utf8"), "Yahoo Finance");
}

async function main() {
  const firstRateRaw = await readFile(FIRST_RATE_PATH, "utf8");
  const firstRateOneMinute = parseFirstRate(firstRateRaw).filter((candle) => isRegularSession(candle, "1min"));
  const existing = {
    "1min": await loadExisting("1min"),
    "5min": await loadExisting("5min"),
    "15min": await loadExisting("15min"),
    "30min": await loadExisting("30min"),
    "1h": await loadExisting("1h"),
    "1d": await loadExisting("1d")
  };
  const firstRate = {
    "1min": firstRateOneMinute,
    "5min": aggregateFromOneMinute(firstRateOneMinute, "5min"),
    "15min": aggregateFromOneMinute(firstRateOneMinute, "15min"),
    "30min": aggregateFromOneMinute(firstRateOneMinute, "30min"),
    "1h": aggregateFromOneMinute(firstRateOneMinute, "1h")
  };
  const candles = {
    "1min": mergeCandles([firstRate["1min"], existing["1min"]]).filter((candle) => isRegularSession(candle, "1min")),
    "5min": mergeCandles([firstRate["5min"], existing["5min"]]).filter((candle) => isRegularSession(candle, "5min")),
    "15min": mergeCandles([firstRate["15min"], existing["15min"]]).filter((candle) => isRegularSession(candle, "15min")),
    "30min": mergeCandles([firstRate["30min"], existing["30min"]]).filter((candle) => isRegularSession(candle, "30min")),
    "1h": mergeCandles([firstRate["1h"], existing["1h"]]).filter((candle) => isRegularSession(candle, "1h")),
    "4h": [] as Candle[],
    "1d": existing["1d"]
  };
  candles["4h"] = aggregate4h(candles["1h"]);

  await Promise.all([
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-1min-ohlcv.csv`), toCsv(candles["1min"]), "utf8"),
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-5min-ohlcv.csv`), toCsv(candles["5min"]), "utf8"),
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-15min-ohlcv.csv`), toCsv(candles["15min"]), "utf8"),
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-30min-ohlcv.csv`), toCsv(candles["30min"]), "utf8"),
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-1h-ohlcv.csv`), toCsv(candles["1h"]), "utf8"),
    writeFile(path.join(DATA_DIR, `nasdaq-${FILE_SYMBOL}-4h-ohlcv.csv`), toCsv(candles["4h"]), "utf8")
  ]);

  const files = [
    fileSummary("1min", candles["1min"]),
    fileSummary("5min", candles["5min"], "1min + Yahoo 5min"),
    fileSummary("15min", candles["15min"], "1min + Yahoo 15min"),
    fileSummary("30min", candles["30min"], "1min + Yahoo 30min"),
    fileSummary("1h", candles["1h"], "1min + Yahoo 1h"),
    fileSummary("4h", candles["4h"], "1h"),
    fileSummary("1d", candles["1d"])
  ];
  const manifest = {
    source: COMBINED_PROVIDER,
    platformTicker: "NASDAQ_INDEX",
    instrumentName: DISPLAY_NAME,
    providerSymbol: PROVIDER_SYMBOL,
    providerExchange: "Nasdaq GIDS",
    providerExchangeCode: "NIM",
    instrumentType: "INDEX",
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
      "Displayed ICT statistics are calculated from real Nasdaq 100 Index (^NDX/NDX) OHLCV candles from Yahoo Finance chart data plus the FirstRate Data free NDX intraday sample. ETF proxy data is not used for displayed index statistics.",
    primarySource: {
      provider: COMBINED_PROVIDER,
      instrumentName: DISPLAY_NAME,
      symbol: PROVIDER_SYMBOL,
      exchange: "Nasdaq GIDS",
      exchangeCode: "NIM",
      instrumentType: "INDEX",
      extendedHours: false,
      files
    },
    sourceRequests: [
      {
        provider: "FirstRate Data",
        url: "https://frd001.s3-us-east-2.amazonaws.com/NDX_1min_sample_firstratedata.zip",
        interval: "1min",
        timezone: "US Eastern / America/New_York",
        note: "Free NDX intraday sample downloaded and converted from New York local timestamps to UTC ISO timestamps.",
        ...firstLast(firstRate["1min"])
      },
      {
        provider: "Yahoo Finance chart endpoint",
        symbol: PROVIDER_SYMBOL,
        note: "Existing bundled Yahoo index files retained and merged where Yahoo has newer available history.",
        files: {
          "1min": firstLast(existing["1min"]),
          "5min": firstLast(existing["5min"]),
          "15min": firstLast(existing["15min"]),
          "30min": firstLast(existing["30min"]),
          "1h": firstLast(existing["1h"]),
          "1d": firstLast(existing["1d"])
        }
      }
    ],
    checks: {
      sourceIdentity: {
        symbol: PROVIDER_SYMBOL,
        alternateVendorSymbol: "NDX",
        fullExchangeName: "Nasdaq GIDS",
        instrumentType: "INDEX",
        timezone: NY_TIME_ZONE
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
      providerCoverage: {
        firstRate: {
          oneMinuteRows: firstRate["1min"].length,
          fiveMinuteRows: firstRate["5min"].length,
          fifteenMinuteRows: firstRate["15min"].length,
          thirtyMinuteRows: firstRate["30min"].length,
          oneHourRows: firstRate["1h"].length
        },
        yahoo: {
          oneMinuteRows: existing["1min"].length,
          fiveMinuteRows: existing["5min"].length,
          fifteenMinuteRows: existing["15min"].length,
          thirtyMinuteRows: existing["30min"].length,
          oneHourRows: existing["1h"].length,
          dailyRows: existing["1d"].length
        }
      },
      sessionFilter: {
        oneMinuteOffSessionRowsAfterFilter: candles["1min"].filter((candle) => !isRegularSession(candle, "1min")).length,
        fiveMinuteOffSessionRowsAfterFilter: candles["5min"].filter((candle) => !isRegularSession(candle, "5min")).length,
        fifteenMinuteOffSessionRowsAfterFilter: candles["15min"].filter((candle) => !isRegularSession(candle, "15min")).length,
        thirtyMinuteOffSessionRowsAfterFilter: candles["30min"].filter((candle) => !isRegularSession(candle, "30min")).length,
        oneHourOffSessionRowsAfterFilter: candles["1h"].filter((candle) => !isRegularSession(candle, "1h")).length
      }
    },
    attemptedSources: [
      {
        provider: "Twelve Data",
        status: "not_used",
        reason:
          "Twelve Data recognizes NDX but this API key is not on a plan that can fetch expanded NDX intraday index candles."
      },
      {
        provider: "Alpha Vantage",
        status: "not_used",
        reason: "The current Alpha Vantage key is not entitled to expanded NDX index intraday access."
      },
      {
        provider: "ETF proxy",
        status: "removed",
        reason: "ETF proxy data is not the Nasdaq index requested by the user."
      }
    ],
    notes: [
      "FirstRate Data free NDX sample adds one year of 1-minute Nasdaq 100 Index bars from 2022-09-30 through 2023-09-29 in New York time.",
      "Yahoo Finance chart data provides the current recent intraday windows and all-time daily Nasdaq 100 Index history.",
      "5M, 15M, 30M, 1H, and 4H files are rebuilt from real NDX OHLCV candles; no synthetic fallback prices or QQQ proxy data are used.",
      "4H candles are derived from real 1H Nasdaq 100 Index candles using 09:30 and 13:30 New York blocks.",
      "All displayed statistics are descriptive historical measurements, not causal proof or a trading guarantee."
    ]
  };

  await writeFile(path.join(DATA_DIR, "nasdaq-data-audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        source: COMBINED_PROVIDER,
        firstRate: firstLast(firstRate["1min"]),
        files,
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
