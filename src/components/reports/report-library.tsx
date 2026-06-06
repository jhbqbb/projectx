"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Download, Filter, Loader2, Play, TableProperties } from "lucide-react";
import { REPORT_MODULES } from "@/lib/constants";
import { cn, formatPct } from "@/lib/utils";
import { ChartCard, DistributionCurve, ProbabilityBars, WeekdayComparison } from "@/components/analytics/chart-card";
import { NoDataState } from "@/components/data/no-data-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StatSummary } from "@/types";

type ReportResponse = {
  hasData: boolean;
  noDataReason?: string;
  dataset?: { name: string; source: string };
  report: null | {
    title: string;
    summary: StatSummary;
    charts: {
      winRateChart: Array<{ name: string; value: number; sampleSize?: number }>;
      weekdayChart: Array<{ name: string; value: number; secondary?: number; sampleSize?: number }>;
      distribution: Array<{ name: string; value: number }>;
    };
  };
};

export function ReportLibrary() {
  const [active, setActive] = useState("context-vs-regular");
  const [response, setResponse] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const activeReport = useMemo(() => REPORT_MODULES.find((report) => report.id === active) ?? REPORT_MODULES[0], [active]);
  const ActiveIcon = activeReport.icon;
  const summary = response?.report?.summary;

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetch(`/api/reports/${active}`)
      .then((res) => res.json())
      .then((data: ReportResponse) => {
        if (mounted) setResponse(data);
      })
      .catch(() => {
        if (mounted) setResponse({ hasData: false, report: null, noDataReason: "Unable to load report data." });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [active]);

  return (
    <div className="grid gap-4 xl:grid-cols-[310px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
        <div className="mb-3 flex items-center justify-between px-2">
          <div className="text-sm font-semibold">Modules</div>
          <Badge variant="info">{REPORT_MODULES.length}</Badge>
        </div>
        <div className="space-y-2">
          {REPORT_MODULES.map((report) => {
            const Icon = report.icon;
            const selected = active === report.id;

            return (
              <button
                key={report.id}
                type="button"
                onClick={() => setActive(report.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors",
                  selected
                    ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-50"
                    : "border-white/8 bg-black/15 text-muted-foreground hover:bg-white/[0.055] hover:text-foreground"
                )}
              >
                <Icon className={cn("size-4", report.accent)} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{report.title}</span>
                <ArrowRight className={cn("size-4", selected ? "text-cyan-200" : "opacity-30")} />
              </button>
            );
          })}
        </div>
      </aside>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md border border-white/10 bg-black/20">
              <ActiveIcon className={cn("size-5", activeReport.accent)} />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-normal">{activeReport.title}</h2>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge variant="secondary">{response?.dataset?.name ?? "Latest dataset"}</Badge>
                {summary ? <Badge variant={summary.confidence > 70 ? "success" : "warning"}>{summary.confidence}/100 confidence</Badge> : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select defaultValue="5min">
              <SelectTrigger className="w-[130px] border-white/10 bg-black/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1min">1 minute</SelectItem>
                <SelectItem value="5min">5 minute</SelectItem>
                <SelectItem value="15min">15 minute</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Filter className="size-4" />
              Filters
            </Button>
            <Button variant="premium">
              <Play className="size-4" />
              Run
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.035]">
            <Loader2 className="size-5 animate-spin text-cyan-300" />
          </div>
        ) : !response?.hasData || !response.report || !summary ? (
          <NoDataState reason={response?.noDataReason} />
        ) : (
          <>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Context bull -> response bear", formatPct(summary.contextBullishRegularBearish)],
            ["Context bear -> response bull", formatPct(summary.contextBearishRegularBullish)],
            ["Average move", `${summary.averageMove}%`],
            ["Expectancy", `${summary.expectancy}%`]
          ].map(([label, value], index) => (
            <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
              <Card className="border-white/10 bg-white/[0.035]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground">{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{value}</div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Report Win Rates">
            <ProbabilityBars data={response.report.charts.winRateChart} />
          </ChartCard>
          <ChartCard title="Weekday Split">
            <WeekdayComparison data={response.report.charts.weekdayChart} />
          </ChartCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <ChartCard title="Distribution Curve">
            <DistributionCurve data={response.report.charts.distribution} />
          </ChartCard>

          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TableProperties className="size-4 text-cyan-300" />
                Statistical Table
              </CardTitle>
              <Button variant="outline" size="sm">
                <Download className="size-4" />
                Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-white/8">
                      <th className="py-2 text-left font-medium">Period</th>
                      <th className="py-2 text-right font-medium">Sample</th>
                      <th className="py-2 text-right font-medium">Reversal</th>
                      <th className="py-2 text-right font-medium">Continuation</th>
                      <th className="py-2 text-right font-medium">Expectancy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.monthly.slice(0, 8).map((row) => (
                      <tr key={row.key} className="border-b border-white/6 last:border-0">
                        <td className="py-2">{row.label}</td>
                        <td className="py-2 text-right">{row.sampleSize}</td>
                        <td className="py-2 text-right">{formatPct(row.contextBullishRegularBearish)}</td>
                        <td className="py-2 text-right">{formatPct(row.continuation)}</td>
                        <td className="py-2 text-right">{row.expectancy}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
          </>
        )}
      </section>
    </div>
  );
}
