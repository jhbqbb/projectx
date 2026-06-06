"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Database, Loader2, Sigma, TrendingUp } from "lucide-react";
import { formatPct } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChartCard, DistributionCurve, EquityCurve, ProbabilityBars, WeekdayComparison } from "@/components/analytics/chart-card";
import { ProbabilityHeatmap } from "@/components/analytics/probability-heatmap";
import { NoDataState } from "@/components/data/no-data-state";
import type { AnalyticsSnapshot } from "@/server/analytics";

export function DashboardOverview() {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetch("/api/stats/session")
      .then((response) => response.json())
      .then((data: AnalyticsSnapshot) => {
        if (mounted) setSnapshot(data);
      })
      .catch(() => {
        if (mounted) {
          setSnapshot({
            hasData: false,
            dataset: null,
            summary: null,
            sessions: [],
            charts: { probability: [], weekday: [], distribution: [], equity: [], heatmap: [] },
            patterns: [],
            warnings: [],
            noDataReason: "Unable to load analytics. Check the database connection."
          });
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const summary = snapshot?.summary;
  const kpis = useMemo(
    () =>
      summary
        ? [
            {
              label: "Context bull -> response bear",
              value: summary.contextBullishRegularBearish,
              icon: ArrowDownRight,
              tone: "text-rose-300"
            },
            {
              label: "Context bear -> response bull",
              value: summary.contextBearishRegularBullish,
              icon: ArrowUpRight,
              tone: "text-emerald-300"
            },
            {
              label: "Continuation",
              value: summary.continuation,
              icon: TrendingUp,
              tone: "text-cyan-300"
            },
            {
              label: "Confidence",
              value: summary.confidence,
              icon: Sigma,
              tone: "text-amber-300"
            }
          ]
        : [],
    [summary]
  );

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.035]">
        <Loader2 className="size-5 animate-spin text-cyan-300" />
      </div>
    );
  }

  if (!snapshot?.hasData || !summary) {
    return <NoDataState reason={snapshot?.noDataReason} />;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.26 }}
            >
              <Card className="border-white/10 bg-white/[0.035]">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
                  <Icon className={`size-4 ${kpi.tone}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold tracking-normal">
                    {kpi.label === "Confidence" ? `${kpi.value}/100` : formatPct(kpi.value)}
                  </div>
                  <div className="mt-3">
                    <Progress value={kpi.value} className="h-1.5 bg-white/10" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <ChartCard title="Directional Probability">
          <ProbabilityBars data={snapshot.charts.probability} />
        </ChartCard>

        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Dataset Quality</CardTitle>
              <Badge variant="info">{snapshot.dataset?.source}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-white/10 bg-black/20 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Database className="size-3.5" />
                  Session days
                </div>
                <div className="mt-2 text-2xl font-semibold">{summary.sampleSize}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-black/20 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="size-3.5" />
                  Overfit risk
                </div>
                <div className="mt-2 text-2xl font-semibold">{summary.confidence >= 75 ? "Low" : summary.confidence >= 55 ? "Moderate" : "High"}</div>
              </div>
            </div>

            <div className="space-y-3">
              {[
                ["Dataset", snapshot.dataset?.name ?? "Latest dataset"],
                ["Avg move", `${summary.averageMove}%`],
                ["Median move", `${summary.medianMove}%`],
                ["Max move", `${summary.maximumMove}%`],
                ["Std dev", `${summary.standardDeviation}%`],
                ["Expectancy", `${summary.expectancy}%`]
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-white/8 pb-2 text-sm last:border-0">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Weekday Breakdown">
          <WeekdayComparison
            data={snapshot.charts.weekday}
          />
        </ChartCard>
        <ChartCard title="Response Session Move Distribution">
          <DistributionCurve data={snapshot.charts.distribution} />
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <ChartCard title="Probability Heatmap">
          <ProbabilityHeatmap data={snapshot.charts.heatmap} />
        </ChartCard>
        <ChartCard title="Research Equity Curve">
          <EquityCurve data={snapshot.charts.equity} />
        </ChartCard>
      </section>
    </div>
  );
}
