import { NextResponse } from "next/server";
import { getResearchSnapshot } from "@/server/research-snapshot";

export const maxDuration = 60;

export async function GET() {
  const snapshot = await getResearchSnapshot();
  return NextResponse.json(snapshot);
}
