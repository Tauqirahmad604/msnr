import { NextResponse } from "next/server";
import { gradeAllSnr, lastAtr } from "@/lib/engine";
import { BTC_TIMEFRAMES, fetchBtcBook } from "@/lib/market";
import type { Candle } from "@/lib/types";

export const dynamic = "force-dynamic";

let cache: { at: number; body: unknown } | null = null;

function thin(candles: Candle[]) {
  return candles.slice(-220);
}

export async function GET() {
  if (cache && Date.now() - cache.at < 20000) {
    return NextResponse.json(cache.body);
  }

  try {
    const book = await fetchBtcBook();
    const graded = gradeAllSnr(
      BTC_TIMEFRAMES.map((timeframe) => ({ timeframe, candles: book.candles[timeframe] }))
    );
    const frames = BTC_TIMEFRAMES.map((timeframe) => {
      const candles = book.candles[timeframe];
      return {
        timeframe,
        candles: thin(candles),
        aLevels: graded[timeframe].aLevels,
        vLevels: graded[timeframe].vLevels,
        atr: lastAtr(candles),
      };
    });
    const body = {
      symbol: book.symbol,
      spot: book.spot,
      source: book.source,
      frames,
      updatedAt: Date.now(),
    };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bitcoin chart unavailable";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
