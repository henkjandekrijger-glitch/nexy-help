import { NextRequest, NextResponse } from "next/server";
import { reviewLearning } from "@/lib/peer-learning";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await reviewLearning(), { headers: { "Cache-Control": "no-store" } });
}
