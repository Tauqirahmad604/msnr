import { NextResponse } from "next/server";
import {
  analyzeTimeframe,
  freshSnrLevels,
  lastAtr,
  RULE_TEXT,
  type EntryTf,
} from "@/lib/engine";
import { fetchMacro } from "@/lib/macro";
import { fetchGoldSeries, type GoldChartTimeframe } from "@/lib/market";
import type { Candle } from "@/lib/types";

export const dynamic = "force-dynamic";

const ENTRY_TFS: EntryTf[] = ["5m", "15m", "30m"];
const CHART_TFS: GoldChartTimeframe[] = ["5m", "15m", "30m", "1h", "4h", "1d", "1w", "1mo"];

let cache: { at: number; body: unknown } | null = null;

function thin(candles: Candle[]) {
  return candles.slice(-220);
}

export async function GET() {
  if (cache && Date.now() - cache.at < 20000) {
    return NextResponse.json(cache.body);
  }

  try {
    const [series, macro] = await Promise.all([fetchGoldSeries(), fetchMacro()]);
    const spot = series["5m"][series["5m"].length - 1].close;
    const frames = ENTRY_TFS.map((tf) => {
      const scanned = analyzeTimeframe(
        series[tf],
        tf,
        series["1h"],
        series["4h"],
        series["1d"]
      );
      return {
        timeframe: tf,
        candles: thin(series[tf]),
        live: scanned.live,
        stats: scanned.stats,
        aLevels: scanned.aLevels,
        vLevels: scanned.vLevels,
        recent: scanned.trades.slice(-20).reverse(),
        atr: lastAtr(series[tf]),
        biasH1: scanned.biasH1,
        biasH4: scanned.biasH4,
        biasD1: scanned.biasD1,
      };
    });
    const charts = CHART_TFS.map((tf) => {
      const marks = freshSnrLevels(series[tf]);
      return {
        timeframe: tf,
        candles: thin(series[tf]),
        aLevels: marks.aLevels,
        vLevels: marks.vLevels,
        atr: lastAtr(series[tf]),
      };
    });

    const body = {
      symbol: "XAUUSD" as const,
      spot,
      futures: spot,
      basis: 0,
      source: "OANDA:XAUUSD",
      rule: RULE_TEXT,
      macro,
      frames,
      charts,
      updatedAt: Date.now(),
    };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Desk unavailable";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
