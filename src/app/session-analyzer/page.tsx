"use client";

import { useEffect, useState } from "react";
import { Clock3, Database, Loader2, Moon, SunMedium } from "lucide-react";
import { SESSION_WINDOWS } from "@/lib/constants";
import { ChartCard, ProbabilityBars, WeekdayComparison } from "@/components/analytics/chart-card";
import { NoDataState } from "@/components/data/no-data-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsSnapshot } from "@/server/analytics";

export default function SessionAnalyzerPage() {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetch("/api/stats/session")
      .then((response) => response.json())
      .then((payload: AnalyticsSnapshot) => {
        if (mounted) setSnapshot(payload);
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
            noDataReason: "Unable to load session data."
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

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.035]">
        <Loader2 className="size-5 animate-spin text-cyan-300" />
      </div>
    );
  }

  if (!snapshot?.hasData || !snapshot.summary) {
    return <NoDataState reason={snapshot?.noDataReason} />;
  }

  const summary = snapshot.summary;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Moon className="size-4 text-cyan-300" />
              {SESSION_WINDOWS.context.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {SESSION_WINDOWS.context.start} {"->"} {SESSION_WINDOWS.context.end}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">Alpha Vantage extended-hours coverage</div>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <SunMedium className="size-4 text-amber-300" />
              {SESSION_WINDOWS.newYork.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{SESSION_WINDOWS.newYork.start}</div>
            <div className="mt-2 text-sm text-muted-foreground">Response session anchor</div>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="size-4 text-emerald-300" />
              Valid Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div className="text-2xl font-semibold">{summary.sampleSize}</div>
              <Badge variant="success">{summary.confidence}/100 confidence</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Session Direction Outcomes">
          <ProbabilityBars data={snapshot.charts.probability} />
        </ChartCard>
        <ChartCard title="Weekday Session Behavior">
          <WeekdayComparison data={snapshot.charts.weekday} />
        </ChartCard>
      </div>

      <Card className="border-white/10 bg-white/[0.035]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock3 className="size-4 text-cyan-300" />
            Session Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            {[
              ["Average move", `${summary.averageMove}%`],
              ["Median move", `${summary.medianMove}%`],
              ["Maximum move", `${summary.maximumMove}%`],
              ["Std deviation", `${summary.standardDeviation}%`],
              ["Expectancy", `${summary.expectancy}%`]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-white/8 bg-black/20 p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-2 text-xl font-semibold">{value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
