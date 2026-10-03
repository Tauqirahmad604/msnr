import type { BtcTimeframe, Candle, Timeframe } from "@/lib/types";

const RESOLUTION: Record<Timeframe, string> = {
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1d": "1D",
};

const ORDER: Timeframe[] = ["5m", "15m", "30m", "1h", "4h", "1d"];
const GOLD_EXTRA = ["1w", "1mo"] as const;
const GOLD_EXTRA_RESOLUTION: Record<(typeof GOLD_EXTRA)[number], string> = {
  "1w": "1W",
  "1mo": "1M",
};

export type GoldChartTimeframe = Timeframe | (typeof GOLD_EXTRA)[number];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function packet(payload: object) {
  const msg = JSON.stringify(payload);
  return `~m~${msg.length}~m~${msg}`;
}

function parseMessages(raw: string) {
  const out: { m?: string; p?: unknown[] }[] = [];
  for (const part of raw.split(/~m~\d+~m~/)) {
    if (!part.startsWith("{")) continue;
    try {
      out.push(JSON.parse(part));
    } catch {
      /* ignore partial frames */
    }
  }
  return out;
}

function loadOandaSeries(symbol: string, tf: string, resolution: string): Promise<Candle[]> {
  const socket = new WebSocket(
    "wss://data.tradingview.com/socket.io/websocket",
    { headers: { Origin: "https://www.tradingview.com" } } as unknown as string[]
  );
  const chart = `cs_${tf}`;
  const seen = new Set<number>();
  const bars: Candle[] = [];

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`${symbol} ${tf} chart timed out`));
    }, 20000);

    socket.addEventListener("open", () => {
      socket.send(packet({ m: "set_auth_token", p: ["unauthorized_user_token"] }));
      socket.send(packet({ m: "chart_create_session", p: [chart, ""] }));
      const spec =
        "=" +
        JSON.stringify({
          symbol,
          adjustment: "splits",
          session: "regular",
        });
      socket.send(packet({ m: "resolve_symbol", p: [chart, "sym", spec] }));
      socket.send(
        packet({
          m: "create_series",
          p: [chart, "s1", "s1", "sym", resolution, 5000, ""],
        })
      );
    });

    socket.addEventListener("message", (event) => {
      const raw = String(event.data);
      const beat = raw.match(/~h~\d+/);
      if (beat) socket.send(beat[0]);
      for (const msg of parseMessages(raw)) {
        const container = msg.p?.[1] as { s1?: { s?: { v: number[] }[] } } | undefined;
        const series = container?.s1?.s;
        if (Array.isArray(series)) {
          for (const row of series) {
            const v = row.v;
            if (!Array.isArray(v) || v.length < 5 || seen.has(v[0])) continue;
            seen.add(v[0]);
            bars.push({
              time: v[0],
              open: round2(v[1]),
              high: round2(v[2]),
              low: round2(v[3]),
              close: round2(v[4]),
              volume: v[5] ?? 0,
            });
          }
        }
        if (msg.m === "series_completed") {
          clearTimeout(timer);
          bars.sort((a, b) => a.time - b.time);
          socket.close();
          resolve(bars);
        }
        if (msg.m === "symbol_error" || msg.m === "series_error") {
          clearTimeout(timer);
          socket.close();
          reject(new Error(`${symbol} ${tf} symbol was rejected`));
        }
      }
    });

    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`${symbol} ${tf} chart connection failed`));
    });
  });
}

function loadOandaTimeframe(tf: Timeframe): Promise<Candle[]> {
  return loadOandaSeries("OANDA:XAUUSD", tf, RESOLUTION[tf]);
}

export interface GoldBook {
  series: Record<GoldChartTimeframe, Candle[]>;
}

async function loadOandaBook(): Promise<Record<Timeframe, Candle[]> & GoldBook> {
  const rows = await Promise.all([
    ...ORDER.map(async (tf) => [tf, await loadOandaTimeframe(tf)] as const),
    ...GOLD_EXTRA.map(async (tf) => [tf, await loadOandaSeries("OANDA:XAUUSD", tf, GOLD_EXTRA_RESOLUTION[tf])] as const),
  ]);
  const books = {} as Record<Timeframe, Candle[]> & GoldBook;
  const series = {} as Record<GoldChartTimeframe, Candle[]>;
  for (const [tf, candles] of rows) {
    if (candles.length < 30) throw new Error(`OANDA ${tf} history is incomplete`);
    series[tf] = candles;
    if (tf === "5m" || tf === "15m" || tf === "30m" || tf === "1h" || tf === "4h" || tf === "1d") {
      books[tf] = candles;
    }
  }
  books.series = series;
  return books;
}

let cached: { at: number; book: Record<Timeframe, Candle[]> & GoldBook } | null = null;
let pending: Promise<Record<Timeframe, Candle[]> & GoldBook> | null = null;

async function book(): Promise<Record<Timeframe, Candle[]> & GoldBook> {
  if (cached && Date.now() - cached.at < 20000) return cached.book;
  if (!pending) {
    pending = loadOandaBook()
      .then((next) => {
        cached = { at: Date.now(), book: next };
        pending = null;
        return next;
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

export interface SpotSeries {
  candles: Candle[];
  spot: number;
  futures: number;
  basis: number;
  source: string;
  symbol: "XAUUSD";
}

export async function fetchSpotSeries(tf: Timeframe): Promise<SpotSeries> {
  const candles = (await book())[tf];
  const spot = candles[candles.length - 1].close;
  return {
    candles,
    spot,
    futures: spot,
    basis: 0,
    symbol: "XAUUSD",
    source: "OANDA:XAUUSD",
  };
}

export async function fetchGoldSeries(): Promise<Record<GoldChartTimeframe, Candle[]>> {
  return (await book()).series;
}

const BTC_RESOLUTION: Record<BtcTimeframe, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1d": "1D",
  "1w": "1W",
  "1mo": "1M",
};

export const BTC_TIMEFRAMES: BtcTimeframe[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
  "1mo",
];

export interface BtcBook {
  candles: Record<BtcTimeframe, Candle[]>;
  spot: number;
  source: "OANDA:BTCUSD";
  symbol: "BTCUSD";
}

let btcCached: { at: number; book: BtcBook } | null = null;
let btcPending: Promise<BtcBook> | null = null;

async function loadBtcBook(): Promise<BtcBook> {
  const rows = await Promise.all(
    BTC_TIMEFRAMES.map(async (tf) => {
      const candles = await loadOandaSeries("OANDA:BTCUSD", tf, BTC_RESOLUTION[tf]);
      if (candles.length < 30) throw new Error(`OANDA:BTCUSD ${tf} history is incomplete`);
      return [tf, candles] as const;
    })
  );
  const candles = {} as Record<BtcTimeframe, Candle[]>;
  for (const [tf, bars] of rows) candles[tf] = bars;
  const spot = candles["1m"][candles["1m"].length - 1].close;
  return { candles, spot, source: "OANDA:BTCUSD", symbol: "BTCUSD" };
}

export async function fetchBtcBook(): Promise<BtcBook> {
  if (btcCached && Date.now() - btcCached.at < 20000) return btcCached.book;
  if (!btcPending) {
    btcPending = loadBtcBook()
      .then((next) => {
        btcCached = { at: Date.now(), book: next };
        btcPending = null;
        return next;
      })
      .catch((error) => {
        btcPending = null;
        throw error;
      });
  }
  return btcPending;
}
