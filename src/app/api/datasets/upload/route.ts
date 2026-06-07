import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { createDatasetFromCandles } from "@/server/ingestion";
import type { CandleInput } from "@/server/statistics";

const uploadSchema = z.object({
  ticker: z.string().min(1).max(12).default("NASDAQ"),
  name: z.string().min(1).max(120).default("Uploaded Nasdaq dataset"),
  interval: z.enum(["1min", "5min", "15min", "30min", "60min"]).default("5min"),
  csv: z.string().min(10)
});

type CsvRow = {
  timestamp?: string;
  time?: string;
  date?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
};

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const body = uploadSchema.parse(await request.json());
    const parsed = Papa.parse<CsvRow>(body.csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase()
    });

    if (parsed.errors.length) {
      return NextResponse.json({ error: parsed.errors[0].message }, { status: 400 });
    }

    const candles: CandleInput[] = parsed.data
      .map((row) => {
        const timestamp = row.timestamp ?? row.time ?? row.date;
        return {
          timestamp: timestamp ? new Date(timestamp) : new Date("invalid"),
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
          volume: Number(row.volume ?? 0),
          raw: row
        };
      })
      .filter((candle) =>
        !Number.isNaN(candle.timestamp.getTime()) &&
        [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (!candles.length) {
      return NextResponse.json({ error: "No valid OHLCV rows found." }, { status: 400 });
    }

    const dataset = await createDatasetFromCandles({
      ownerId: user.id,
      ticker: body.ticker,
      name: body.name,
      interval: body.interval,
      candles
    });

    return NextResponse.json({ dataset });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload dataset." },
      { status: 400 }
    );
  }
}
