import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { createDatasetFromCandles } from "@/server/ingestion";
import type { CandleInput } from "@/server/statistics";

const bundledSchema = z.object({
  interval: z.enum(["1min", "15min"]).default("15min")
});

const bundledFiles = {
  "1min": {
    file: "nasdaq-ndx-1min-ohlcv.csv",
    name: "Nasdaq 100 Index 1min Yahoo OHLCV"
  },
  "15min": {
    file: "nasdaq-ndx-15min-ohlcv.csv",
    name: "Nasdaq 100 Index 15min Yahoo OHLCV"
  }
} as const;

type CsvRow = {
  timestamp?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
};

function parseCsv(csv: string): CandleInput[] {
  const parsed = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase()
  });

  if (parsed.errors.length) {
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data
    .map((row) => ({
      timestamp: row.timestamp ? new Date(row.timestamp) : new Date("invalid"),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume ?? 0),
      raw: row
    }))
    .filter(
      (candle) =>
        !Number.isNaN(candle.timestamp.getTime()) &&
        [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const body = bundledSchema.parse(await request.json());
    const bundled = bundledFiles[body.interval];
    const csvPath = path.join(process.cwd(), "public", "data", bundled.file);
    const csv = await readFile(csvPath, "utf8");
    const candles = parseCsv(csv);

    if (!candles.length) {
      return NextResponse.json({ error: "No valid bundled OHLCV rows found." }, { status: 400 });
    }

    const dataset = await createDatasetFromCandles({
      ownerId: user.id,
      ticker: "^NDX",
      name: bundled.name,
      interval: body.interval,
      candles,
      sessionTemplate: "opening"
    });

    return NextResponse.json({ dataset });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to ingest bundled OHLCV." },
      { status: 400 }
    );
  }
}
