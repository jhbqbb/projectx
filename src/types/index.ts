export type Direction = "BULLISH" | "BEARISH" | "FLAT" | "UNKNOWN";

export type SessionDay = {
  tradingDate: string;
  weekday: number;
  year: number;
  month: number;
  contextOpen: number | null;
  contextHigh: number | null;
  contextLow: number | null;
  contextClose: number | null;
  contextMovePct: number | null;
  contextRangePct: number | null;
  contextDirection: Direction;
  contextCandleCount: number;
  regularOpen: number | null;
  regularHigh: number | null;
  regularLow: number | null;
  regularClose: number | null;
  regularMovePct: number | null;
  regularRangePct: number | null;
  regularDirection: Direction;
  regularCandleCount: number;
  regularOpenVsContextHighPct: number | null;
  regularOpenVsContextLowPct: number | null;
  regularBrokeContextHigh: boolean;
  regularBrokeContextLow: boolean;
  regularReversedContext: boolean;
  dataQualityScore: number;
};

export type BreakDownRow = {
  key: string;
  label: string;
  sampleSize: number;
  contextBullishRegularBearish: number;
  contextBearishRegularBullish: number;
  continuation: number;
  averageMove: number;
  medianMove: number;
  expectancy: number;
  confidence: number;
};

export type StatSummary = {
  sampleSize: number;
  contextBullishRegularBearish: number;
  contextBearishRegularBullish: number;
  continuation: number;
  averageMove: number;
  medianMove: number;
  maximumMove: number;
  standardDeviation: number;
  expectancy: number;
  confidence: number;
  yearly: BreakDownRow[];
  monthly: BreakDownRow[];
  weekday: BreakDownRow[];
};

export type ChartPoint = {
  name: string;
  value: number;
  secondary?: number;
  sampleSize?: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};
