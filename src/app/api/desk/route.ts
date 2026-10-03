import { NextResponse } from "next/server";
import {
  analyzeTimeframe,
  lastAtr,
  RULE_TEXT,
  type EntryTf,
} from "@/lib/engine";
import { fetchMacro } from "@/lib/macro";
import { fetchSpotSeries } from "@/lib/market";
import type { Candle } from "@/lib/types";

export const dynamic = "force-dynamic";

const ENTRY_TFS: EntryTf[] = ["5m", "15m", "30m"];

let cache: { at: number; body: unknown } | null = null;

function thin(candles: Candle[]) {
  return candles.slice(-220);
}

export async function GET() {
  if (cache && Date.now() - cache.at < 20000) {
    return NextResponse.json(cache.body);
  }

  try {
    const [m5, m15, m30, h1, h4, d1, macro] = await Promise.all([
      fetchSpotSeries("5m"),
      fetchSpotSeries("15m"),
      fetchSpotSeries("30m"),
      fetchSpotSeries("1h"),
      fetchSpotSeries("4h"),
      fetchSpotSeries("1d"),
      fetchMacro(),
    ]);

    const series = { "5m": m5, "15m": m15, "30m": m30 } as const;
    const frames = ENTRY_TFS.map((tf) => {
      const scanned = analyzeTimeframe(
        series[tf].candles,
        tf,
        h1.candles,
        h4.candles,
        d1.candles
      );
      return {
        timeframe: tf,
        candles: thin(series[tf].candles),
        live: scanned.live,
        stats: scanned.stats,
        aLevels: scanned.aLevels,
        vLevels: scanned.vLevels,
        recent: scanned.trades.slice(-20).reverse(),
        atr: lastAtr(series[tf].candles),
        biasH1: scanned.biasH1,
        biasH4: scanned.biasH4,
        biasD1: scanned.biasD1,
      };
    });

    const body = {
      symbol: "XAUUSD" as const,
      spot: m5.spot,
      futures: m5.futures,
      basis: m5.basis,
      source: m5.source,
      rule: RULE_TEXT,
      macro,
      frames,
      updatedAt: Date.now(),
    };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Desk unavailable";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
