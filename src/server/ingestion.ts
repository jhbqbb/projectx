import { prisma } from "@/lib/prisma";
import {
  fetchAlphaVantageDaily,
  fetchAlphaVantageIntraday,
  intervalToPrisma,
  normalizeNasdaqTicker,
  type AlphaVantageInterval
} from "@/server/alpha-vantage";
import { deriveTradingDaysFromCandles, deriveTradingDaysFromDailyCandles, type CandleInput } from "@/server/statistics";

export async function ingestAlphaVantageDataset(params: {
  ownerId: string;
  ticker: string;
  interval?: AlphaVantageInterval;
  month?: string;
  mode?: "auto" | "daily";
}) {
  const ticker = normalizeNasdaqTicker(params.ticker);
  const interval = params.interval ?? "5min";
  const requestedIntervalEnum = intervalToPrisma[interval];
  const job = await prisma.ingestionJob.create({
    data: {
      source: "ALPHA_VANTAGE",
      ticker,
      interval: requestedIntervalEnum,
      metadata: { month: params.month ?? null }
    }
  });

  try {
    let actualIntervalEnum: typeof requestedIntervalEnum | "DAILY" = requestedIntervalEnum;
    let mode: "intraday" | "daily-fallback" = "intraday";
    let fallbackReason: string | null = null;
    let candles: CandleInput[];

    if (params.mode === "daily") {
      fallbackReason = "Daily mode requested.";
      candles = await fetchAlphaVantageDaily({ ticker });
      actualIntervalEnum = "DAILY";
      mode = "daily-fallback";
    } else {
      try {
        candles = await fetchAlphaVantageIntraday({
          ticker,
          interval,
          month: params.month
        });
      } catch (error) {
        fallbackReason = error instanceof Error ? error.message : "Intraday Alpha Vantage request failed.";
        await new Promise((resolve) => setTimeout(resolve, 1300));
        candles = await fetchAlphaVantageDaily({ ticker });
        actualIntervalEnum = "DAILY";
        mode = "daily-fallback";
      }
    }

    const tradingDays =
      mode === "daily-fallback"
        ? deriveTradingDaysFromDailyCandles(candles)
        : deriveTradingDaysFromCandles(candles, Number(interval.replace("min", "")));
    const fromDate = candles[0]?.timestamp;
    const toDate = candles[candles.length - 1]?.timestamp;
    const coverageScore = tradingDays.length
      ? tradingDays.reduce((sum, day) => sum + day.dataQualityScore, 0) / tradingDays.length
      : 0;

    const dataset = await prisma.dataset.create({
      data: {
        ownerId: params.ownerId,
        name: mode === "daily-fallback" ? `${ticker} daily Alpha Vantage latest` : `${ticker} ${interval} ${params.month ?? "latest"}`,
        ticker,
        source: "ALPHA_VANTAGE",
        status: "PENDING",
        interval: actualIntervalEnum,
        fromDate,
        toDate,
        metadata: {
          alphaVantageMonth: params.month ?? null,
          alphaVantageMode: mode,
          fallbackReason,
          sessionDefinition: {
            context:
              mode === "daily-fallback"
                ? "Prior daily close -> current daily open"
                : "04:00-09:25 America/New_York",
            regular:
              mode === "daily-fallback"
                ? "Current daily open -> current daily close"
                : "09:30-16:00 America/New_York",
            note:
              mode === "daily-fallback"
                ? "Daily OHLCV fallback was used because the configured Alpha Vantage key could not access intraday data."
                : "Alpha Vantage US equity extended-hours data does not cover the full overnight futures session."
          }
        }
      }
    });

    await prisma.$transaction([
      prisma.candle.createMany({
        data: candles.map((candle) => ({
          datasetId: dataset.id,
          ticker,
          timestamp: candle.timestamp,
          interval: actualIntervalEnum,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: BigInt(candle.volume ?? 0),
          source: "ALPHA_VANTAGE",
          raw: candle.raw as object
        })),
        skipDuplicates: true
      }),
      prisma.tradingDay.createMany({
        data: tradingDays.map((day) => ({
          datasetId: dataset.id,
          tradingDate: new Date(`${day.tradingDate}T00:00:00.000Z`),
          weekday: day.weekday,
          year: day.year,
          month: day.month,
          contextOpen: day.contextOpen,
          contextHigh: day.contextHigh,
          contextLow: day.contextLow,
          contextClose: day.contextClose,
          contextMovePct: day.contextMovePct,
          contextRangePct: day.contextRangePct,
          contextDirection: day.contextDirection,
          contextCandleCount: day.contextCandleCount,
          regularOpen: day.regularOpen,
          regularHigh: day.regularHigh,
          regularLow: day.regularLow,
          regularClose: day.regularClose,
          regularMovePct: day.regularMovePct,
          regularRangePct: day.regularRangePct,
          regularDirection: day.regularDirection,
          regularCandleCount: day.regularCandleCount,
          regularOpenVsContextHighPct: day.regularOpenVsContextHighPct,
          regularOpenVsContextLowPct: day.regularOpenVsContextLowPct,
          regularBrokeContextHigh: day.regularBrokeContextHigh,
          regularBrokeContextLow: day.regularBrokeContextLow,
          regularReversedContext: day.regularReversedContext,
          dataQualityScore: day.dataQualityScore
        })),
        skipDuplicates: true
      }),
      prisma.dataset.update({
        where: { id: dataset.id },
        data: {
          status: "READY",
          candleCount: candles.length,
          tradingDayCount: tradingDays.length,
          coverageScore
        }
      }),
      prisma.ingestionJob.update({
        where: { id: job.id },
        data: {
          datasetId: dataset.id,
          interval: actualIntervalEnum,
          status: "READY",
          finishedAt: new Date(),
          barsInserted: candles.length
        }
      })
    ]);

    return prisma.dataset.findUniqueOrThrow({
      where: { id: dataset.id },
      include: { tradingDays: true }
    });
  } catch (error) {
    await prisma.ingestionJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown ingestion error"
      }
    });

    throw error;
  }
}

export async function createDatasetFromCandles(params: {
  ownerId: string;
  ticker: string;
  name: string;
  interval: AlphaVantageInterval;
  candles: CandleInput[];
}) {
  const ticker = normalizeNasdaqTicker(params.ticker);
  const intervalEnum = intervalToPrisma[params.interval];
  const tradingDays = deriveTradingDaysFromCandles(params.candles, Number(params.interval.replace("min", "")));
  const coverageScore = tradingDays.length
    ? tradingDays.reduce((sum, day) => sum + day.dataQualityScore, 0) / tradingDays.length
    : 0;

  const dataset = await prisma.dataset.create({
    data: {
      ownerId: params.ownerId,
      name: params.name,
      ticker,
      source: "CSV_UPLOAD",
      status: "PENDING",
      interval: intervalEnum,
      fromDate: params.candles[0]?.timestamp,
      toDate: params.candles[params.candles.length - 1]?.timestamp
    }
  });

  await prisma.$transaction([
    prisma.candle.createMany({
      data: params.candles.map((candle) => ({
        datasetId: dataset.id,
        ticker,
        timestamp: candle.timestamp,
        interval: intervalEnum,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: BigInt(candle.volume ?? 0),
        source: "CSV_UPLOAD",
        raw: candle.raw as object
      })),
      skipDuplicates: true
    }),
    prisma.tradingDay.createMany({
      data: tradingDays.map((day) => ({
        datasetId: dataset.id,
        tradingDate: new Date(`${day.tradingDate}T00:00:00.000Z`),
        weekday: day.weekday,
        year: day.year,
        month: day.month,
        contextOpen: day.contextOpen,
        contextHigh: day.contextHigh,
        contextLow: day.contextLow,
        contextClose: day.contextClose,
        contextMovePct: day.contextMovePct,
        contextRangePct: day.contextRangePct,
        contextDirection: day.contextDirection,
        contextCandleCount: day.contextCandleCount,
        regularOpen: day.regularOpen,
        regularHigh: day.regularHigh,
        regularLow: day.regularLow,
        regularClose: day.regularClose,
        regularMovePct: day.regularMovePct,
        regularRangePct: day.regularRangePct,
        regularDirection: day.regularDirection,
        regularCandleCount: day.regularCandleCount,
        regularOpenVsContextHighPct: day.regularOpenVsContextHighPct,
        regularOpenVsContextLowPct: day.regularOpenVsContextLowPct,
        regularBrokeContextHigh: day.regularBrokeContextHigh,
        regularBrokeContextLow: day.regularBrokeContextLow,
        regularReversedContext: day.regularReversedContext,
        dataQualityScore: day.dataQualityScore
      })),
      skipDuplicates: true
    }),
    prisma.dataset.update({
      where: { id: dataset.id },
      data: {
        status: "READY",
        candleCount: params.candles.length,
        tradingDayCount: tradingDays.length,
        coverageScore
      }
    })
  ]);

  return prisma.dataset.findUniqueOrThrow({
    where: { id: dataset.id },
    include: { tradingDays: true }
  });
}
