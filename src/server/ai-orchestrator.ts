import OpenAI from "openai";
import { REPORT_MODULES } from "@/lib/constants";
import { buildQuestionSql, isReadOnlyAnalyticsSql } from "@/server/sql-guard";
import { calculateStatSummary, findPatternCandidates } from "@/server/statistics";
import type { SessionDay } from "@/types";

export type ResearchContext = {
  summary: ReturnType<typeof calculateStatSummary>;
  sql: string;
  calculations: string[];
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
}): ResearchContext {
  const days = params.days ?? [];
  const summary = calculateStatSummary(days);
  const hasData = days.length > 0 && summary.sampleSize > 0;
  const sql = hasData ? buildQuestionSql(params.question, params.selectedReports) : "No SQL plan yet. Ingest data first.";
  const patterns = hasData ? findPatternCandidates(days).slice(0, 3) : [];
  const calculations = [
    ...(hasData
      ? [
          `Sample size: ${summary.sampleSize} valid session days`,
          `Context bullish -> response bearish: ${summary.contextBullishRegularBearish}%`,
          `Context bearish -> response bullish: ${summary.contextBearishRegularBullish}%`,
          `Same-direction continuation probability: ${summary.continuation}%`,
          `Average response-session move: ${summary.averageMove}%`,
          `Median response-session move: ${summary.medianMove}%`,
          `Expectancy: ${summary.expectancy}%`,
          `Standard deviation: ${summary.standardDeviation}%`
        ]
      : ["No historical dataset is available yet. Ingest Alpha Vantage data or upload OHLCV first."])
  ];

  return {
    hasData,
    noDataReason: hasData ? undefined : params.noDataReason ?? "No historical dataset is available yet.",
    summary,
    sql,
    calculations,
    chartSpec: [
      { type: "bar", title: "Directional Probabilities", metric: "probability" },
      { type: "heatmap", title: "Weekday x Trading Condition", metric: "win_rate" },
      { type: "distribution", title: "Response Session Move Distribution", metric: "regularMovePct" }
    ],
    followUps: [
      "Split the condition by weekday and month.",
      "Compare gap direction, opening drive, and first-hour behavior.",
      "Run the same condition on a holdout period only.",
      "Find common characteristics across reversal and continuation days."
    ],
    warnings: [
      ...(!hasData ? [params.noDataReason ?? "No historical dataset is available yet."] : []),
      ...(hasData && summary.sampleSize < 50 ? ["Low sample size: fewer than 50 valid session days."] : []),
      ...(hasData && summary.confidence < 60 ? ["Confidence below 60: treat as hypothesis, not a trading rule."] : []),
      ...patterns
        .filter((pattern) => pattern.sampleSize < 30)
        .map((pattern) => `${pattern.label} has only ${pattern.sampleSize} samples.`)
    ],
    sourceDatasets: params.sourceDatasets?.length ? params.sourceDatasets : []
  };
}

export function createFallbackAnswer(question: string, context: ResearchContext) {
  if (!context.hasData) {
    return [
      `No data available yet for: "${question}".`,
      "",
      "Ingest historical Alpha Vantage OHLCV data or upload a dataset first. After ingestion, I can analyze any trading question across reports, patterns, sessions, weekdays, gaps, ranges, opens, and reversals."
    ].join("\n");
  }

  return [
    `I analyzed the available historical trading dataset for: "${question}".`,
    "",
    `The strongest directional read is context bearish -> response bullish at ${context.summary.contextBearishRegularBullish}% across the valid sample. Context bullish -> response bearish is ${context.summary.contextBullishRegularBearish}%, and same-direction continuation is ${context.summary.continuation}%.`,
    "",
    `Average absolute response-session move is ${context.summary.averageMove}%, median move is ${context.summary.medianMove}%, maximum observed move is ${context.summary.maximumMove}%, and signed expectancy is ${context.summary.expectancy}%. Confidence is ${context.summary.confidence}/100 based on sample size, dispersion, and data coverage.`,
    "",
    "SQL plan:",
    context.sql,
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
Answer broadly across trading research topics: sessions, gaps, opens, ranges, reversals, continuations, weekdays, volatility, expectancy, sample quality, and hidden patterns.
Explain findings in plain English, include sample size, probability, average move, median move, expectancy, standard deviation, confidence, warnings, and overfitting risk when data exists.
If no dataset exists, say "No data available yet" and tell the user to ingest Alpha Vantage data or upload OHLCV.
When SQL is shown, keep it read-only and analytical.
When a sample is weak, say so clearly.

Available report modules:
${reportList}

Source datasets:
${context.sourceDatasets.join(", ")}

Deterministic calculations:
${context.calculations.join("\n")}

Approved SQL:
${isReadOnlyAnalyticsSql(context.sql) ? context.sql : "SQL withheld because it failed safety checks."}`;
}

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}
