"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, ShieldAlert, SlidersHorizontal, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProbabilityHeatmap } from "@/components/analytics/probability-heatmap";
import { NoDataState } from "@/components/data/no-data-state";

type Pattern = {
  id: string;
  label: string;
  sampleSize: number;
  reversalRate: number;
  averageMove: number;
  confidence: number;
  risk: string;
};

type PatternResponse = {
  hasData: boolean;
  noDataReason?: string;
  patterns: Pattern[];
  heatmap: Array<{ day: string; condition: string; value: number; sampleSize: number }>;
};

export default function PatternExplorerPage() {
  const [data, setData] = useState<PatternResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetch("/api/patterns")
      .then((response) => response.json())
      .then((payload: PatternResponse) => {
        if (mounted) setData(payload);
      })
      .catch(() => {
        if (mounted) setData({ hasData: false, patterns: [], heatmap: [], noDataReason: "Unable to load pattern data." });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-normal">Pattern Explorer</h2>
          <div className="mt-1 text-sm text-muted-foreground">Historical trading conditions ranked by confidence and sample quality.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex min-w-[260px] items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3">
            <Search className="size-4 text-muted-foreground" />
            <Input className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" placeholder="Search condition" />
          </div>
          <Button variant="outline">
            <SlidersHorizontal className="size-4" />
            Filters
          </Button>
          <Button variant="premium" asChild>
            <a href="/ai-research">
              <Sparkles className="size-4" />
              Ask AI
            </a>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.035]">
          <Loader2 className="size-5 animate-spin text-cyan-300" />
        </div>
      ) : !data?.hasData ? (
        <NoDataState reason={data?.noDataReason} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_0.92fr]">
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader>
              <CardTitle className="text-sm">Condition Heatmap</CardTitle>
            </CardHeader>
            <CardContent>
              <ProbabilityHeatmap data={data.heatmap} />
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader>
              <CardTitle className="text-sm">Candidates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.patterns.map((pattern) => (
                <div key={pattern.id} className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{pattern.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        n={pattern.sampleSize} - avg move {pattern.averageMove}% - reversal {pattern.reversalRate}%
                      </div>
                    </div>
                    <Badge variant={pattern.risk === "Researchable" ? "success" : "warning"}>{pattern.risk}</Badge>
                  </div>
                  {pattern.sampleSize < 30 ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-amber-200">
                      <ShieldAlert className="size-3.5" />
                      Validate before promoting this to a saved study.
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
