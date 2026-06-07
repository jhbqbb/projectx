"use client";

import { FormEvent, useState } from "react";
import { FileDown, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const bundledFiles = [
  {
    interval: "1min",
    label: "Nasdaq 100 Index 1 minute",
    url: "/data/nasdaq-ndx-1min-ohlcv.csv",
    rows: "3,120",
    coverage: "2026-05-27 to 2026-06-05",
    ingestInterval: "1min"
  },
  {
    interval: "5min",
    label: "Nasdaq 100 Index 5 minute",
    url: "/data/nasdaq-ndx-5min-ohlcv.csv",
    rows: "4,680",
    coverage: "2026-03-12 to 2026-06-05",
    ingestInterval: "5min"
  },
  {
    interval: "15min",
    label: "Nasdaq 100 Index 15 minute",
    url: "/data/nasdaq-ndx-15min-ohlcv.csv",
    rows: "1,560",
    coverage: "2026-03-12 to 2026-06-05",
    ingestInterval: "15min"
  },
  {
    interval: "30min",
    label: "Nasdaq 100 Index 30 minute",
    url: "/data/nasdaq-ndx-30min-ohlcv.csv",
    rows: "780",
    coverage: "2026-03-12 to 2026-06-05",
    ingestInterval: "30min"
  },
  {
    interval: "1h",
    label: "Nasdaq 100 Index 1 hour",
    url: "/data/nasdaq-ndx-1h-ohlcv.csv",
    rows: "5,089",
    coverage: "2023-07-11 to 2026-06-05",
    ingestInterval: null
  },
  {
    interval: "4h",
    label: "Nasdaq 100 Index 4 hour",
    url: "/data/nasdaq-ndx-4h-ohlcv.csv",
    rows: "1,453",
    coverage: "2023-07-11 to 2026-06-05",
    ingestInterval: null
  },
  {
    interval: "1d",
    label: "Nasdaq 100 Index daily",
    url: "/data/nasdaq-ndx-1d-ohlcv.csv",
    rows: "9,174",
    coverage: "1990-01-02 to 2026-06-05",
    ingestInterval: null
  }
] as const;

export function IngestionForm() {
  const [interval, setIntervalValue] = useState("15min");
  const [provider, setProvider] = useState("twelve-data");
  const [bundledLoading, setBundledLoading] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "idle"; message: string }>({
    tone: "idle",
    message: ""
  });
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus({ tone: "idle", message: "" });

    const form = new FormData(event.currentTarget);
    const ticker = String(form.get("ticker") || "NASDAQ");
    const month = String(form.get("month") || "").trim();

    try {
      const response = await fetch("/api/datasets/ingest-market-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          interval,
          provider,
          ...(month ? { month } : {})
        })
      });
      const payload = (await response.json()) as {
        error?: string;
        dataset?: { tradingDayCount: number; candleCount: number; name: string; ticker: string };
      };

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Market data ingestion failed.");
      }

      setStatus({
        tone: "success",
        message: `Ingested ${payload.dataset?.candleCount ?? 0} candles and ${payload.dataset?.tradingDayCount ?? 0} trading days. Dashboard data is now live.`
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Market data ingestion failed."
      });
    } finally {
      setLoading(false);
    }
  }

  async function ingestBundled(file: (typeof bundledFiles)[number]) {
    if (!file.ingestInterval) {
      return;
    }

    setBundledLoading(file.interval);
    setStatus({ tone: "idle", message: "" });

    try {
      const uploadResponse = await fetch("/api/datasets/ingest-bundled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interval: file.ingestInterval
        })
      });
      const payload = (await uploadResponse.json()) as {
        error?: string;
        dataset?: { tradingDayCount: number; candleCount: number; name: string; ticker: string };
      };

      if (!uploadResponse.ok || payload.error) {
        throw new Error(payload.error ?? "Unable to ingest bundled OHLCV.");
      }

      setStatus({
        tone: "success",
        message: `Ingested ${payload.dataset?.candleCount ?? 0} bundled candles and ${payload.dataset?.tradingDayCount ?? 0} trading days from ${file.label}.`
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to ingest bundled OHLCV."
      });
    } finally {
      setBundledLoading(null);
    }
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="ticker">Market</Label>
        <Input id="ticker" name="ticker" defaultValue="NDX" className="border-white/10 bg-black/20" />
      </div>
      <div className="space-y-2">
        <Label>Provider</Label>
        <Select
          value={provider}
          onValueChange={(value) => {
            setProvider(value);
            if (value === "twelve-data" && interval === "60min") {
              setIntervalValue("15min");
            }
          }}
        >
          <SelectTrigger className="border-white/10 bg-black/20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="twelve-data">Twelve Data</SelectItem>
            <SelectItem value="alpha-vantage">Alpha Vantage</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Interval</Label>
        <Select value={interval} onValueChange={setIntervalValue}>
          <SelectTrigger className="border-white/10 bg-black/20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1min">1 minute</SelectItem>
            <SelectItem value="5min">5 minute</SelectItem>
            <SelectItem value="15min">15 minute</SelectItem>
            <SelectItem value="30min">30 minute</SelectItem>
            {provider === "alpha-vantage" ? <SelectItem value="60min">60 minute</SelectItem> : null}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="month">Historical month</Label>
        <Input id="month" name="month" placeholder="2026-05" className="border-white/10 bg-black/20" />
        <p className="text-xs leading-5 text-muted-foreground">
          Provider fetches are optional and may require index access on the selected provider plan. The bundled NDX files below are available without provider env vars.
        </p>
      </div>
      <div className="flex items-start pt-8">
        <Button variant="premium" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          Fetch market data
        </Button>
      </div>
      <div className="md:col-span-2 rounded-md border border-white/10 bg-black/20 p-3">
        <div className="text-sm font-medium">Bundled real OHLCV files</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">
          Static Nasdaq 100 Index files are available without provider env vars. Pattern Explorer and AI read the 5M, 15M, 30M, 1H, and 4H files directly; PostgreSQL session ingestion supports the 1M, 5M, 15M, and 30M files.
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {bundledFiles.map((file) => (
            <div key={file.interval} className="rounded-md border border-white/8 bg-white/[0.035] p-3">
              <div className="text-sm font-medium">{file.label}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {file.rows} rows - {file.coverage}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {file.url}
              </div>
              <div className="mt-3 flex gap-2">
                {file.ingestInterval ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => ingestBundled(file)}
                    disabled={Boolean(bundledLoading)}
                  >
                    {bundledLoading === file.interval ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                    Ingest
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" asChild>
                  <a href={file.url} download>
                    <FileDown className="size-4" />
                    CSV
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {status.message ? (
        <div
          className={
            status.tone === "success"
              ? "md:col-span-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100"
              : "md:col-span-2 rounded-md border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-100"
          }
        >
          {status.message}
        </div>
      ) : null}
    </form>
  );
}
