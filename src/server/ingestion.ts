import { prisma } from "@/lib/prisma";
import {
  fetchAlphaVantageIntraday,
  intervalToPrisma,
  normalizeNasdaqTicker,
  type AlphaVantageInterval
} from "@/server/alpha-vantage";
import { deriveOpeningContextTradingDaysFromCandles, deriveTradingDaysFromCandles, type CandleInput } from "@/server/statistics";
import { fetchTwelveDataIntraday, type TwelveDataInterval } from "@/server/twelve-data";

export async function ingestAlphaVantageDataset(params: {
  ownerId: string;
  ticker: string;
  interval?: AlphaVantageInterval;
  month?: string;
}) {
  const ticker = normalizeNasdaqTicker(params.ticker);
  const interval = params.interval ?? "15min";
  const intervalEnum = intervalToPrisma[interval];
  const job = await prisma.ingestionJob.create({
    data: {
      source: "ALPHA_VANTAGE",
      ticker,
      interval: intervalEnum,
      metadata: { month: params.month ?? null }
    }
  });

  try {
    let candles: CandleInput[];

    try {
      candles = await fetchAlphaVantageIntraday({
        ticker,
        interval,
        month: params.month
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Intraday Alpha Vantage request failed.";
      throw new Error(
        `${message} Minute-candle research requires Alpha Vantage intraday access for 1min/15min data, or an uploaded minute OHLCV CSV.`
      );
    }

    const tradingDays = deriveTradingDaysFromCandles(candles, Number(interval.replace("min", "")));
    const fromDate = candles[0]?.timestamp;
    const toDate = candles[candles.length - 1]?.timestamp;
    const coverageScore = tradingDays.length
      ? tradingDays.reduce((sum, day) => sum + day.dataQualityScore, 0) / tradingDays.length
      : 0;

    const dataset = await prisma.dataset.create({
      data: {
        ownerId: params.ownerId,
        name: `${ticker} ${interval} ${params.month ?? "latest"}`,
        ticker,
        source: "ALPHA_VANTAGE",
        status: "PENDING",
        interval: intervalEnum,
        fromDate,
        toDate,
        metadata: {
          alphaVantageMonth: params.month ?? null,
          alphaVantageMode: "intraday",
          sessionDefinition: {
            context: "04:00-09:25 America/New_York",
            regular: "09:30-16:00 America/New_York",
            note: "Minute-candle research requires Alpha Vantage intraday access or uploaded minute OHLCV data."
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
          interval: intervalEnum,
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

export async function ingestTwelveDataDataset(params: {
  ownerId: string;
  ticker: string;
  interval?: TwelveDataInterval;
}) {
  const ticker = normalizeNasdaqTicker(params.ticker);
  const interval = params.interval ?? "15min";
  const intervalEnum = intervalToPrisma[interval];
  const job = await prisma.ingestionJob.create({
    data: {
      source: "TWELVE_DATA",
      ticker,
      interval: intervalEnum,
      metadata: { provider: "twelve-data" }
    }
  });

  try {
    const candles = await fetchTwelveDataIntraday({
      ticker,
      interval
    });
    const tradingDays = deriveOpeningContextTradingDaysFromCandles(candles, Number(interval.replace("min", "")));
    const fromDate = candles[0]?.timestamp;
    const toDate = candles[candles.length - 1]?.timestamp;
    const coverageScore = tradingDays.length
      ? tradingDays.reduce((sum, day) => sum + day.dataQualityScore, 0) / tradingDays.length
      : 0;

    const dataset = await prisma.dataset.create({
      data: {
        ownerId: params.ownerId,
        name: `${ticker} ${interval} Twelve Data latest`,
        ticker,
        source: "TWELVE_DATA",
        status: "PENDING",
        interval: intervalEnum,
        fromDate,
        toDate,
        metadata: {
          provider: "twelve-data",
          outputsize: 5000,
          sessionDefinition: {
            context: "09:30-09:59 America/New_York opening context",
            regular: "10:00-15:59 America/New_York response session",
            note: "Minute candles fetched from Twelve Data time_series. Pre/post-market data requires a Twelve Data Pro plan."
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
          interval: intervalEnum,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: BigInt(candle.volume ?? 0),
          source: "TWELVE_DATA",
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
