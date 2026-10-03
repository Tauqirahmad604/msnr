import type { Candle, Timeframe } from "@/lib/types";

const RESOLUTION: Record<Timeframe, string> = {
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1d": "1D",
};

const ORDER: Timeframe[] = ["5m", "15m", "30m", "1h", "4h", "1d"];

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

function loadOandaTimeframe(tf: Timeframe): Promise<Candle[]> {
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
      reject(new Error(`OANDA ${tf} chart timed out`));
    }, 20000);

    socket.addEventListener("open", () => {
      socket.send(packet({ m: "set_auth_token", p: ["unauthorized_user_token"] }));
      socket.send(packet({ m: "chart_create_session", p: [chart, ""] }));
      const symbol =
        "=" +
        JSON.stringify({
          symbol: "OANDA:XAUUSD",
          adjustment: "splits",
          session: "regular",
        });
      socket.send(packet({ m: "resolve_symbol", p: [chart, "sym_xau", symbol] }));
      socket.send(
        packet({
          m: "create_series",
          p: [chart, "s1", "s1", "sym_xau", RESOLUTION[tf], 5000, ""],
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
          reject(new Error(`OANDA ${tf} symbol was rejected`));
        }
      }
    });

    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`OANDA ${tf} chart connection failed`));
    });
  });
}

async function loadOandaBook(): Promise<Record<Timeframe, Candle[]>> {
  const rows = await Promise.all(
    ORDER.map(async (tf) => [tf, await loadOandaTimeframe(tf)] as const)
  );
  const books = {} as Record<Timeframe, Candle[]>;
  for (const [tf, candles] of rows) {
    if (candles.length < 30) throw new Error(`OANDA ${tf} history is incomplete`);
    books[tf] = candles;
  }
  return books;
}

let cached: { at: number; book: Record<Timeframe, Candle[]> } | null = null;
let pending: Promise<Record<Timeframe, Candle[]>> | null = null;

async function book(): Promise<Record<Timeframe, Candle[]>> {
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
