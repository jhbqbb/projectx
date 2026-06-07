import OpenAI from "openai";
import { REPORT_MODULES } from "@/lib/constants";
import { buildQuestionSql } from "@/server/sql-guard";
import { calculateStatSummary, findPatternCandidates } from "@/server/statistics";
import type { SessionDay } from "@/types";

export type ResearchContext = {
  summary: ReturnType<typeof calculateStatSummary>;
  sql: string;
  calculations: string[];
  ictCalculations: string[];
  patterns: ReturnType<typeof findPatternCandidates>;
  chartSpec: Array<{ type: string; title: string; metric: string }>;
  followUps: string[];
  warnings: string[];
  sourceDatasets: string[];
  hasData: boolean;
  noDataReason?: string;
};

export function buildResearchContext(params: {
  question: string;
  selectedReports: string[];
  days?: SessionDay[];
  sourceDatasets?: string[];
  noDataReason?: string;
  ictCalculations?: string[];
}): ResearchContext {
  const days = params.days ?? [];
  const ictCalculations = params.ictCalculations ?? [];
  const summary = calculateStatSummary(days);
  const hasSessionData = days.length > 0 && summary.sampleSize > 0;
  const hasIctData = ictCalculations.length > 0;
  const hasData = hasSessionData || hasIctData;
  const sql = hasSessionData
    ? buildQuestionSql(params.question, params.selectedReports)
    : hasIctData
      ? "Bundled ICT sweep maps are calculated directly from static Nasdaq 100 Index OHLCV CSV files; no database SQL is required for this view."
      : "No SQL plan yet. Ingest data first.";
  const patterns = hasSessionData ? findPatternCandidates(days) : [];
  const strongestExpectancyPatterns = patterns
    .filter((pattern) => pattern.sampleSize > 0)
    .sort((a, b) => b.expectancy - a.expectancy)
    .slice(0, 3);
  const calculations = [
    ...(hasSessionData
      ? [
          "Historical session coverage is available.",
          `Context bullish -> response bearish: ${summary.contextBullishRegularBearish}%`,
          `Context bearish -> response bullish: ${summary.contextBearishRegularBullish}%`,
          `Same-direction continuation probability: ${summary.continuation}%`,
          `Average response-session move: ${summary.averageMove}%`,
          `Median response-session move: ${summary.medianMove}%`,
          `Expectancy: ${summary.expectancy}%`,
          `Standard deviation: ${summary.standardDeviation}%`,
          ...strongestExpectancyPatterns.map(
            (pattern) =>
              `${pattern.label}: ${pattern.expectancy}% expectancy, ${pattern.averageMove}% average absolute move, ${pattern.sampleSize} samples`
          )
        ]
      : hasIctData
        ? [
            "Session-day database snapshot is not connected; using bundled real Nasdaq 100 Index OHLCV ICT pattern maps as source of truth."
          ]
        : ["No historical dataset is available yet. Ingest or upload Nasdaq index OHLCV first."])
  ];

  return {
    hasData,
    noDataReason: hasData ? undefined : params.noDataReason ?? "No historical dataset is available yet.",
    summary,
    sql,
    calculations,
    ictCalculations,
    patterns,
    chartSpec: [
      { type: "bar", title: "Directional Probabilities", metric: "probability" },
      { type: "heatmap", title: "Weekday x Trading Condition", metric: "win_rate" },
      { type: "distribution", title: "Response Session Move Distribution", metric: "regularMovePct" }
    ],
    followUps: [
      "Split the condition by weekday and month.",
      "Compare gap direction, opening drive, and first-hour behavior.",
      "Run the same condition on a holdout period only.",
      "Find common characteristics across reversal and continuation days.",
      "Compare low sweep fade setups by New York hour."
    ],
    warnings: [
      ...(!hasData ? [params.noDataReason ?? "No historical dataset is available yet."] : []),
      ...(hasSessionData && summary.sampleSize < 50 ? ["Thin historical coverage: treat this as a weak read."] : []),
      ...(hasSessionData && summary.confidence < 60 ? ["Confidence below 60: treat as hypothesis, not a trading rule."] : []),
      ...(hasIctData ? ["ICT sweep patterns are descriptive historical statistics; validate out of sample before trading."] : []),
      ...patterns
        .filter((pattern) => pattern.sampleSize < 30)
        .map((pattern) => `${pattern.label} has thin historical coverage.`)
    ],
    sourceDatasets: params.sourceDatasets?.length ? params.sourceDatasets : []
  };
}

export function createFallbackAnswer(question: string, context: ResearchContext) {
  if (!context.hasData) {
    return [
      `No data available yet for: "${question}".`,
      "",
      context.noDataReason ? `Reason: ${context.noDataReason}` : "",
      "",
      "Ingest Nasdaq index OHLCV data or upload an OHLCV dataset first. After ingestion, I can analyze trading questions across reports, patterns, sessions, weekdays, gaps, ranges, opens, and reversals."
    ]
      .filter((line, index, lines) => line || lines[index - 1])
      .join("\n");
  }

  if (context.ictCalculations.length && context.summary.sampleSize === 0) {
    return [
      `I analyzed the bundled real Nasdaq 100 Index ICT sweep maps for: "${question}".`,
      "",
      "Source: Yahoo Finance chart endpoint for ^NDX, bundled in the website. All timestamps are converted to America/New_York.",
      "",
      ...context.ictCalculations.slice(0, 12),
      "",
      "Risk flags: these are descriptive historical statistics, not causal rules. Thin historical reads should be treated carefully.",
      "",
      `Follow-ups: ${context.followUps.join(" ")}`
    ].join("\n");
  }

  const strongestExpectancyPatterns = context.patterns
    .filter((pattern) => pattern.sampleSize > 0)
    .sort((a, b) => b.expectancy - a.expectancy)
    .slice(0, 5);
  const patternLines = strongestExpectancyPatterns.length
    ? strongestExpectancyPatterns.map(
        (pattern, index) =>
          `${index + 1}. ${pattern.label}: expectancy ${pattern.expectancy}%, average absolute move ${pattern.averageMove}%, reversal rate ${pattern.reversalRate}%, confidence ${pattern.confidence}/100, risk ${pattern.risk}.`
      )
    : ["No qualified pattern candidates were found in the current dataset."];

  return [
    `I analyzed the available historical trading dataset for: "${question}".`,
    "",
    "Strongest response-session expectancy patterns:",
    ...patternLines,
    "",
    `The strongest directional read is context bearish -> response bullish at ${context.summary.contextBearishRegularBullish}% across the valid sample. Context bullish -> response bearish is ${context.summary.contextBullishRegularBearish}%, and same-direction continuation is ${context.summary.continuation}%.`,
    "",
    `Average absolute response-session move is ${context.summary.averageMove}%, median move is ${context.summary.medianMove}%, maximum observed move is ${context.summary.maximumMove}%, and signed expectancy is ${context.summary.expectancy}%. Confidence is ${context.summary.confidence}/100 based on sample size, dispersion, and data coverage.`,
    "",
    context.warnings.length ? `Risk flags: ${context.warnings.join(" ")}` : "Risk flags: no major sample-size warnings in this run.",
    "",
    `Follow-ups: ${context.followUps.join(" ")}`
  ].join("\n");
}

export function buildSystemInstructions(context: ResearchContext) {
  const reportList = REPORT_MODULES.map((report) => `${report.id}: ${report.title}`).join("\n");

  return `You are a private trading research AI for historical market datasets.

Use the deterministic statistics provided by the platform as source of truth.
Do not invent trades, live prices, or causal certainty.
All times must be written in America/New_York local time.
Understand ICT-style terminology as research labels only: liquidity sweep, high sweep, low sweep, wick through a prior candle level, close back inside, reversal/fade, continuation/follow-through, displacement, opening range, session timing, and sample-quality risk.
Answer broadly across trading research topics: sessions, gaps, opens, ranges, sweeps, reversals, continuations, weekdays, volatility, expectancy, sample quality, and hidden patterns.
If ICT sweep map calculations are supplied, answer from those real Nasdaq 100 Index OHLCV calculations even when the database session snapshot is unavailable.
Explain findings in plain English with probability, average move, median move, expectancy, standard deviation, confidence, warnings, and overfitting risk when data exists.
Do not expose raw notation such as n=, CI brackets, SQL snippets, variable names, row IDs, or formula-style output unless the user explicitly asks for technical details.
Prefer short text answers: state the setup, the reversal or continuation read, the bias, and the risk in normal trading language.
If no dataset exists, say "No data available yet" and tell the user to ingest Nasdaq index OHLCV or upload OHLCV.
When a sample is weak, say so clearly.

Available report modules:
${reportList}

Source datasets:
${context.sourceDatasets.join(", ")}

Deterministic calculations:
${context.calculations.join("\n")}

ICT sweep map calculations:
${context.ictCalculations.length ? context.ictCalculations.join("\n") : "No ICT sweep map calculations were supplied."}

Pattern candidates:
${context.patterns
  .map(
    (pattern) =>
      `${pattern.label}: expectancy ${pattern.expectancy}%, average move ${pattern.averageMove}%, reversal rate ${pattern.reversalRate}%, confidence ${pattern.confidence}/100, risk ${pattern.risk}`
  )
  .join("\n")}`;
}

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}
