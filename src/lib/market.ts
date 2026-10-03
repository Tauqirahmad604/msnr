import type { Candle, Timeframe } from "@/lib/types";

const YAHOO: Record<Timeframe, { interval: string; range: string }> = {
  "5m": { interval: "5m", range: "60d" },
  "15m": { interval: "15m", range: "60d" },
  "30m": { interval: "30m", range: "60d" },
  "1h": { interval: "60m", range: "3mo" },
  "4h": { interval: "60m", range: "6mo" },
  "1d": { interval: "1d", range: "2y" },
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function aggregate(candles: Candle[], seconds: number): Candle[] {
  const out: Candle[] = [];
  let bucket: Candle | null = null;
  let start = 0;
  for (const c of candles) {
    const bucketStart = Math.floor(c.time / seconds) * seconds;
    if (!bucket || bucketStart !== start) {
      if (bucket) out.push(bucket);
      start = bucketStart;
      bucket = { ...c, time: bucketStart };
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

async function yahooCandles(tf: Timeframe): Promise<Candle[]> {
  const { interval, range } = YAHOO[tf];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Price history HTTP ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote || timestamps.length < 30) throw new Error("No gold candles");

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    if (
      typeof open !== "number" ||
      typeof high !== "number" ||
      typeof low !== "number" ||
      typeof close !== "number"
    ) {
      continue;
    }
    candles.push({
      time: timestamps[i],
      open,
      high,
      low,
      close,
      volume: quote.volume?.[i] ?? 0,
    });
  }
  if (tf === "4h") return aggregate(candles, 4 * 3600);
  return candles;
}

export async function fetchSpotPrice(): Promise<number | null> {
  try {
    const res = await fetch("https://api.gold-api.com/price/XAU", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = Number(data?.price);
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

export interface SpotSeries {
  candles: Candle[];
  /** Live XAUUSD spot. */
  spot: number;
  /** Unadjusted COMEX futures last price, for reference only. */
  futures: number;
  /** spot − futures. Applied to every candle so the chart matches XAUUSD. */
  basis: number;
  source: string;
  symbol: "XAUUSD";
}

export async function fetchSpotSeries(tf: Timeframe): Promise<SpotSeries> {
  const [raw, spot] = await Promise.all([yahooCandles(tf), fetchSpotPrice()]);
  const futures = raw[raw.length - 1].close;
  const basis = spot == null ? 0 : spot - futures;
  const candles = raw.map((c) => ({
    time: c.time,
    open: round2(c.open + basis),
    high: round2(c.high + basis),
    low: round2(c.low + basis),
    close: round2(c.close + basis),
    volume: c.volume,
  }));
  const aligned = spot != null;
  return {
    candles,
    spot: round2(aligned ? spot : futures),
    futures: round2(futures),
    basis: round2(basis),
    symbol: "XAUUSD",
    source: aligned
      ? `XAUUSD spot ${round2(spot)} · candle shape from COMEX shifted ${round2(basis)} so prices match spot gold, not the futures quote`
      : "COMEX gold futures GC=F — live spot feed unavailable, this is NOT XAUUSD spot",
  };
}
