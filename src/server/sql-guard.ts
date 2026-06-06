const BLOCKED_SQL_TOKENS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "truncate",
  "create",
  "grant",
  "revoke",
  "copy",
  "execute",
  "call",
  "merge"
];

const APPROVED_TABLES = ["TradingDay", "Dataset", "Candle"];

export function isReadOnlyAnalyticsSql(sql: string) {
  const normalized = sql.trim().replace(/\s+/g, " ").toLowerCase();

  if (!normalized.startsWith("select")) {
    return false;
  }

  if (normalized.includes(";")) {
    return false;
  }

  if (BLOCKED_SQL_TOKENS.some((token) => normalized.includes(` ${token} `))) {
    return false;
  }

  return APPROVED_TABLES.some((table) => normalized.includes(`"${table.toLowerCase()}"`) || normalized.includes(table.toLowerCase()));
}

export function buildQuestionSql(question: string, selectedReports: string[]) {
  const q = question.toLowerCase();

  if (q.includes("weekday") || selectedReports.includes("day-of-week")) {
    return `SELECT "weekday", COUNT(*) AS sample_size,
AVG(CASE WHEN "contextDirection" = 'BULLISH' AND "regularDirection" = 'BEARISH' THEN 1 ELSE 0 END) * 100 AS context_bullish_regular_bearish,
AVG(ABS("regularMovePct")) AS avg_abs_move,
AVG("regularMovePct") AS expectancy
FROM "TradingDay"
WHERE "contextDirection" IN ('BULLISH', 'BEARISH') AND "regularDirection" IN ('BULLISH', 'BEARISH')
GROUP BY "weekday"
ORDER BY "weekday"`;
  }

  if (q.includes("open") && (q.includes("high") || q.includes("range"))) {
    return `SELECT COUNT(*) AS sample_size,
AVG(CASE WHEN "regularDirection" = 'BEARISH' THEN 1 ELSE 0 END) * 100 AS regular_bearish_probability,
AVG(ABS("regularMovePct")) AS avg_abs_move,
AVG("regularMovePct") AS expectancy
FROM "TradingDay"
WHERE "regularOpenVsContextHighPct" > 0 AND "regularDirection" IN ('BULLISH', 'BEARISH')`;
  }

  if (q.includes("bearish") && q.includes("bullish")) {
    return `SELECT COUNT(*) AS sample_size,
AVG(CASE WHEN "regularDirection" = 'BULLISH' THEN 1 ELSE 0 END) * 100 AS context_bearish_response_bullish,
AVG(ABS("regularMovePct")) AS avg_abs_move,
AVG("regularMovePct") AS expectancy
FROM "TradingDay"
WHERE "contextDirection" = 'BEARISH' AND "regularDirection" IN ('BULLISH', 'BEARISH')`;
  }

  return `SELECT COUNT(*) AS sample_size,
AVG(CASE WHEN "contextDirection" = 'BULLISH' AND "regularDirection" = 'BEARISH' THEN 1 ELSE 0 END) * 100 AS context_bullish_response_bearish,
AVG(CASE WHEN "contextDirection" = 'BEARISH' AND "regularDirection" = 'BULLISH' THEN 1 ELSE 0 END) * 100 AS context_bearish_response_bullish,
AVG(CASE WHEN "contextDirection" = "regularDirection" THEN 1 ELSE 0 END) * 100 AS continuation_probability,
AVG(ABS("regularMovePct")) AS avg_abs_move,
AVG("regularMovePct") AS expectancy
FROM "TradingDay"
WHERE "contextDirection" IN ('BULLISH', 'BEARISH') AND "regularDirection" IN ('BULLISH', 'BEARISH')`;
}
