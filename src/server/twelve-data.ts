import { fromZonedTime } from "date-fns-tz";
import { NY_TIME_ZONE } from "@/lib/constants";
import { resolveNasdaqProviderSymbol, type AlphaVantageInterval } from "@/server/alpha-vantage";
import type { CandleInput } from "@/server/statistics";

type TwelveDataBar = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
};

type TwelveDataResponse = {
  meta?: {
    symbol?: string;
    interval?: string;
    exchange_timezone?: string;
  };
  values?: TwelveDataBar[];
  status?: string;
  code?: number;
  message?: string;
};

export type TwelveDataInterval = Extract<AlphaVantageInterval, "1min" | "5min" | "15min" | "30min">;

export async function fetchTwelveDataIntraday(params: {
  ticker: string;
  interval?: TwelveDataInterval;
  outputsize?: number;
  apiKey?: string;
}) {
  const apiKey = params.apiKey ?? process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY is not configured.");
  }

  const ticker = resolveNasdaqProviderSymbol(params.ticker);
  const interval = params.interval ?? "15min";
  const query = new URLSearchParams({
    symbol: ticker,
    interval,
    outputsize: String(params.outputsize ?? 5000),
    timezone: NY_TIME_ZONE,
    order: "ASC",
    apikey: apiKey
  });

  const response = await fetch(`https://api.twelvedata.com/time_series?${query.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Twelve Data returned ${response.status}.`);
  }

  const payload = (await response.json()) as TwelveDataResponse;

  if (payload.status === "error" || !payload.values?.length) {
    throw new Error(payload.message ?? "Twelve Data response did not include intraday time series data.");
  }

  const candles: CandleInput[] = payload.values.map((bar) => ({
    timestamp: fromZonedTime(bar.datetime.replace(" ", "T"), NY_TIME_ZONE),
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    volume: Number(bar.volume ?? 0),
    raw: bar
  }));

  return candles
    .filter((candle) =>
      [candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(value))
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
