import { REPORT_MODULES } from "@/lib/constants";
import { buildQuestionSql } from "@/server/sql-guard";
import { calculateStatSummary, findPatternCandidates } from "@/server/statistics";
import type { SessionDay } from "@/types";

export function reportTitleFromId(moduleId: string) {
  return REPORT_MODULES.find((module) => module.id === moduleId)?.title ?? "Research Report";
}

export function reportEnumFromId(moduleId: string) {
  return REPORT_MODULES.find((module) => module.id === moduleId)?.enum ?? "CONTEXT_VS_REGULAR";
}

export function buildReport(moduleId: string, days: SessionDay[]) {
  const summary = calculateStatSummary(days);
  const patterns = findPatternCandidates(days);
  const title = reportTitleFromId(moduleId);
  const sql = buildQuestionSql(title, [moduleId]);

  const winRateChart = [
      { name: "Context bull -> response bear", value: summary.contextBullishRegularBearish, sampleSize: summary.sampleSize },
      { name: "Context bear -> response bull", value: summary.contextBearishRegularBullish, sampleSize: summary.sampleSize },
      { name: "Continuation", value: summary.continuation, sampleSize: summary.sampleSize }
  ];

  const weekdayChart = summary.weekday.map((row) => ({
    name: row.label,
    value: row.contextBullishRegularBearish,
    secondary: row.contextBearishRegularBullish,
    sampleSize: row.sampleSize
  }));

  const distribution = days
    .filter((day) => day.regularMovePct !== null)
    .reduce<Record<string, number>>((acc, day) => {
      const bucket = ((Math.round((day.regularMovePct ?? 0) * 10) / 10)).toFixed(1);
      acc[bucket] = (acc[bucket] ?? 0) + 1;
      return acc;
    }, {});

  return {
    moduleId,
    title,
    summary,
    sql,
    sourceDatasets: ["Latest historical research dataset"],
    charts: {
      winRateChart,
      weekdayChart,
      distribution: Object.entries(distribution)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([name, value]) => ({ name, value })),
      yearly: summary.yearly.map((row) => ({
        name: row.label,
        value: row.contextBullishRegularBearish,
        secondary: row.continuation,
        sampleSize: row.sampleSize
      }))
    },
    patterns,
    warnings: [
      ...(summary.sampleSize < 50 ? ["Sample size is below 50. Treat this as exploratory."] : []),
      ...(summary.confidence < 60 ? ["Confidence is below 60. Validate with more years or a holdout period."] : [])
    ]
  };
}
