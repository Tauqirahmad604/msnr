import { NextRequest, NextResponse } from "next/server";
import { fetchGoldCandles } from "@/lib/candles";
import { analyzeSmc } from "@/lib/smc";
import type { Candle, Timeframe } from "@/lib/types";

const VALID: Timeframe[] = ["15m", "1h", "4h", "1d"];

export async function GET(req: NextRequest) {
  const tfParam = (req.nextUrl.searchParams.get("tf") ?? "1h") as Timeframe;
  const timeframe = VALID.includes(tfParam) ? tfParam : "1h";

  const { candles, source, symbol } = await fetchGoldCandles(timeframe);
  const analysis = analyzeSmc(candles, timeframe, { symbol, source });

  // Trim candles for chart payload
  const chartCandles: Candle[] = candles.slice(-180);

  return NextResponse.json({
    analysis,
    candles: chartCandles,
  });
}
