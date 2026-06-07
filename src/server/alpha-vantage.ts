import { fromZonedTime } from "date-fns-tz";
import { NY_TIME_ZONE } from "@/lib/constants";
import type { CandleInput } from "@/server/statistics";

export type AlphaVantageInterval = "1min" | "5min" | "15min" | "30min" | "60min";

export const intervalToPrisma = {
  "1min": "ONE_MINUTE",
  "5min": "FIVE_MINUTES",
  "15min": "FIFTEEN_MINUTES",
  "30min": "THIRTY_MINUTES",
  "60min": "SIXTY_MINUTES"
} as const;

export function normalizeNasdaqTicker(input: string) {
  const ticker = input.trim().toUpperCase();

  if (!/^[A-Z0-9.^-]{1,12}$/.test(ticker)) {
    throw new Error("Ticker must be a Nasdaq-compatible symbol.");
  }

  return ticker;
}

export function resolveNasdaqProviderSymbol(input: string) {
  const ticker = normalizeNasdaqTicker(input);

  return ticker === "NASDAQ" ? "NDX" : ticker;
}

export async function fetchAlphaVantageIntraday(params: {
  ticker: string;
  interval?: AlphaVantageInterval;
  month?: string;
  apiKey?: string;
}) {
  const apiKey = params.apiKey ?? process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    throw new Error("ALPHA_VANTAGE_API_KEY is not configured.");
  }

  const ticker = resolveNasdaqProviderSymbol(params.ticker);
  const interval = params.interval ?? "5min";
  const query = new URLSearchParams({
    function: "TIME_SERIES_INTRADAY",
    symbol: ticker,
    interval,
    outputsize: "full",
    adjusted: "false",
    extended_hours: "true",
    apikey: apiKey
  });

  if (params.month) {
    query.set("month", params.month);
  }

  const response = await fetch(`https://www.alphavantage.co/query?${query.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Alpha Vantage returned ${response.status}.`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const note = payload.Note ?? payload.Information;

  if (typeof note === "string") {
    throw new Error(note);
  }

  const seriesKey = `Time Series (${interval})`;
  const series = payload[seriesKey] as Record<string, Record<string, string>> | undefined;

  if (!series) {
    throw new Error("Alpha Vantage response did not include intraday time series data.");
  }

  const candles: CandleInput[] = Object.entries(series).map(([timestamp, values]) => ({
    timestamp: fromZonedTime(timestamp.replace(" ", "T"), NY_TIME_ZONE),
    open: Number(values["1. open"]),
    high: Number(values["2. high"]),
    low: Number(values["3. low"]),
    close: Number(values["4. close"]),
    volume: Number(values["5. volume"] ?? 0),
    raw: values
  }));

  return candles
    .filter((candle) =>
      [candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(value))
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
