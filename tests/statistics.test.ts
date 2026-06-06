import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { NY_TIME_ZONE } from "../src/lib/constants";
import { calculateStatSummary, deriveTradingDaysFromCandles, type CandleInput } from "../src/server/statistics";

function nyTime(value: string) {
  return fromZonedTime(value, NY_TIME_ZONE);
}

describe("statistics engine", () => {
  it("derives context and regular session features from candles", () => {
    const candles: CandleInput[] = [
      { timestamp: nyTime("2026-06-02T04:00:00"), open: 100, high: 101, low: 99, close: 100.5 },
      { timestamp: nyTime("2026-06-02T09:25:00"), open: 100.5, high: 103, low: 100, close: 102 },
      { timestamp: nyTime("2026-06-02T09:30:00"), open: 102, high: 102.3, low: 101, close: 101.8 },
      { timestamp: nyTime("2026-06-02T16:00:00"), open: 101.8, high: 102, low: 98, close: 99 }
    ];

    const days = deriveTradingDaysFromCandles(candles, 5);

    expect(days).toHaveLength(1);
    expect(days[0].tradingDate).toBe("2026-06-02");
    expect(days[0].contextDirection).toBe("BULLISH");
    expect(days[0].regularDirection).toBe("BEARISH");
    expect(days[0].regularReversedContext).toBe(true);
  });

  it("calculates required directional probabilities and move statistics", () => {
    const summary = calculateStatSummary([
      {
        tradingDate: "2026-06-01",
        weekday: 1,
        year: 2026,
        month: 6,
        contextOpen: 100,
        contextHigh: 103,
        contextLow: 99,
        contextClose: 102,
        contextMovePct: 2,
        contextRangePct: 4,
        contextDirection: "BULLISH",
        contextCandleCount: 84,
        regularOpen: 102,
        regularHigh: 103,
        regularLow: 99,
        regularClose: 100,
        regularMovePct: -1.96,
        regularRangePct: 3.92,
        regularDirection: "BEARISH",
        regularCandleCount: 79,
        regularOpenVsContextHighPct: -0.97,
        regularOpenVsContextLowPct: 3.03,
        regularBrokeContextHigh: false,
        regularBrokeContextLow: false,
        regularReversedContext: true,
        dataQualityScore: 1
      },
      {
        tradingDate: "2026-06-02",
        weekday: 2,
        year: 2026,
        month: 6,
        contextOpen: 100,
        contextHigh: 101,
        contextLow: 97,
        contextClose: 98,
        contextMovePct: -2,
        contextRangePct: 4,
        contextDirection: "BEARISH",
        contextCandleCount: 84,
        regularOpen: 98,
        regularHigh: 102,
        regularLow: 97,
        regularClose: 101,
        regularMovePct: 3.06,
        regularRangePct: 5.1,
        regularDirection: "BULLISH",
        regularCandleCount: 79,
        regularOpenVsContextHighPct: -2.97,
        regularOpenVsContextLowPct: 1.03,
        regularBrokeContextHigh: true,
        regularBrokeContextLow: false,
        regularReversedContext: true,
        dataQualityScore: 1
      }
    ]);

    expect(summary.sampleSize).toBe(2);
    expect(summary.contextBullishRegularBearish).toBe(100);
    expect(summary.contextBearishRegularBullish).toBe(100);
    expect(summary.continuation).toBe(0);
    expect(summary.averageMove).toBeGreaterThan(2);
    expect(summary.expectancy).toBeCloseTo(0.53, 1);
  });
});
