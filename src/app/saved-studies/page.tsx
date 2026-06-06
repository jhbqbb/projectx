"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Loader2, MoreHorizontal, Save, Tag } from "lucide-react";
import { NoDataState } from "@/components/data/no-data-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SavedStudy = {
  id: string;
  title: string;
  thesis: string;
  tags: string[];
  metrics: Record<string, unknown>;
  updatedAt: string;
};

export default function SavedStudiesPage() {
  const [studies, setStudies] = useState<SavedStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("Save research from AI Research or Reports to build this library.");

  useEffect(() => {
    let mounted = true;

    fetch("/api/studies")
      .then(async (response) => {
        if (response.status === 401) {
          return { studies: [], reason: "Sign in to view saved studies." };
        }

        const payload = await response.json();
        return { studies: payload.studies ?? [], reason: "Save research from AI Research or Reports to build this library." };
      })
      .then((payload: { studies: SavedStudy[]; reason: string }) => {
        if (!mounted) return;
        setStudies(payload.studies);
        setReason(payload.reason);
      })
      .catch(() => {
        if (mounted) {
          setStudies([]);
          setReason("Unable to load saved studies. Check the database connection.");
        }
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
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] p-4">
        <div>
          <h2 className="text-lg font-semibold tracking-normal">Saved Studies</h2>
          <div className="mt-1 text-sm text-muted-foreground">Research notes, source reports, and active hypotheses.</div>
        </div>
        <Button variant="premium" asChild>
          <a href="/ai-research">
            <Save className="size-4" />
            Save Study
          </a>
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.035]">
          <Loader2 className="size-5 animate-spin text-cyan-300" />
        </div>
      ) : studies.length === 0 ? (
        <NoDataState title="No saved studies yet" reason={reason} showAction={false} />
      ) : (
        <div className="grid gap-4">
          {studies.map((study) => {
            const confidence = typeof study.metrics?.confidence === "number" ? study.metrics.confidence : null;
            return (
              <Card key={study.id} className="border-white/10 bg-white/[0.035]">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="text-base">{study.title}</CardTitle>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {study.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          <Tag className="mr-1 size-3" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Study actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <p className="max-w-4xl text-sm leading-6 text-muted-foreground">{study.thesis}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {confidence === null ? null : (
                      <Badge variant={confidence >= 70 ? "success" : confidence >= 60 ? "info" : "warning"}>
                        {confidence}/100 confidence
                      </Badge>
                    )}
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3.5" />
                      {new Date(study.updatedAt).toLocaleDateString("en-US")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
