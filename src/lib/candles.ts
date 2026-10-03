import type { Candle, Timeframe } from "@/lib/types";

const YAHOO_INTERVAL: Record<Timeframe, { interval: string; range: string }> = {
  "5m": { interval: "5m", range: "5d" },
  "15m": { interval: "15m", range: "10d" },
  "30m": { interval: "30m", range: "1mo" },
  "1h": { interval: "60m", range: "1mo" },
  "4h": { interval: "60m", range: "3mo" },
  "1d": { interval: "1d", range: "1y" },
};

function aggregateTo4h(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const out: Candle[] = [];
  let bucket: Candle | null = null;
  let bucketStart = 0;

  for (const c of candles) {
    const start = Math.floor(c.time / (4 * 3600)) * (4 * 3600);
    if (!bucket || start !== bucketStart) {
      if (bucket) out.push(bucket);
      bucketStart = start;
      bucket = {
        time: start,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      };
    } else {
      bucket.high = Math.max(bucket.high, c.high);
      bucket.low = Math.min(bucket.low, c.low);
      bucket.close = c.close;
      bucket.volume += c.volume;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

function synthesizeCandles(seedPrice = 2650): Candle[] {
  // Offline fallback so the UI still works if market data is blocked.
  const candles: Candle[] = [];
  let price = seedPrice;
  const now = Math.floor(Date.now() / 1000);
  for (let i = 240; i >= 0; i--) {
    const drift = Math.sin(i / 18) * 6 + Math.cos(i / 9) * 3;
    const shock = ((i * 17) % 11) - 5;
    const open = price;
    const close = Math.max(1000, open + drift * 0.35 + shock * 0.8);
    const high = Math.max(open, close) + Math.abs(shock) * 0.4 + 1.2;
    const low = Math.min(open, close) - Math.abs(drift) * 0.25 - 1.1;
    candles.push({
      time: now - i * 3600,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: 1000 + (i % 50) * 20,
    });
    price = close;
  }
  return candles;
}

export async function fetchGoldCandles(
  timeframe: Timeframe
): Promise<{ candles: Candle[]; source: string; symbol: string }> {
  const { interval, range } = YAHOO_INTERVAL[timeframe];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=${interval}&range=${range}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AureumSMC/1.0; +https://localhost)",
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error("No chart result");

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote || timestamps.length === 0) throw new Error("Empty quote");

    let candles: Candle[] = timestamps
      .map((t, i) => {
        const open = quote.open?.[i];
        const high = quote.high?.[i];
        const low = quote.low?.[i];
        const close = quote.close?.[i];
        const volume = quote.volume?.[i] ?? 0;
        if (
          open == null ||
          high == null ||
          low == null ||
          close == null ||
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close)
        ) {
          return null;
        }
        return {
          time: t,
          open,
          high,
          low,
          close,
          volume: volume ?? 0,
        } satisfies Candle;
      })
      .filter((c): c is Candle => c !== null);

    if (timeframe === "4h") {
      candles = aggregateTo4h(candles);
    }

    if (candles.length < 30) throw new Error("Insufficient candles");

    return {
      candles,
      source: "Yahoo Finance GC=F (COMEX Gold Futures ≈ XAUUSD)",
      symbol: "XAUUSD",
    };
  } catch {
    const candles = synthesizeCandles();
    return {
      candles: timeframe === "4h" ? aggregateTo4h(candles) : candles,
      source: "Synthetic demo series (live feed unavailable)",
      symbol: "XAUUSD",
    };
  }
}
