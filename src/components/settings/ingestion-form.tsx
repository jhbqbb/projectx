"use client";

import { FormEvent, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function IngestionForm() {
  const [interval, setIntervalValue] = useState("15min");
  const [provider, setProvider] = useState("twelve-data");
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
    const ticker = String(form.get("ticker") || "QQQ");
    const month = String(form.get("month") || "").trim();

    try {
      const response = await fetch("/api/datasets/ingest-alpha-vantage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          interval,
          provider,
          ...(month ? { month } : {})
        })
      });
      const payload = (await response.json()) as { error?: string; dataset?: { tradingDayCount: number; candleCount: number; name: string } };

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Alpha Vantage ingestion failed.");
      }

      setStatus({
        tone: "success",
        message: `Ingested ${payload.dataset?.candleCount ?? 0} candles and ${payload.dataset?.tradingDayCount ?? 0} trading days. Dashboard data is now live.`
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Alpha Vantage ingestion failed."
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="ticker">Ticker</Label>
        <Input id="ticker" name="ticker" defaultValue="QQQ" className="border-white/10 bg-black/20" />
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
          Twelve Data is the default minute-candle source. Alpha Vantage month is only used when that provider is selected.
        </p>
      </div>
      <div className="flex items-start pt-8">
        <Button variant="premium" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          Fetch market data
        </Button>
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
