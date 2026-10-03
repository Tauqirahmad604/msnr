import type { Candle } from "@/lib/types";

/** 4206 → 4207 = 10 pips, so 1 pip = 0.1 price. 50 pips = 5.0. */
export const PIP = 0.1;
export const MAX_STOP_PIPS = 50;

export type EntryTf = "5m" | "15m" | "30m";
export type Bias = "bullish" | "bearish" | "ranging";

export interface ModelConfig {
  tpR: number;
  /** When set, target is this many pips instead of a multiple of risk. */
  fixedTpPips: number | null;
  minRisk: number;
  maxRisk: number;
  buffer: number;
  /** Skip the signal when recent ATR is wider than this (price units). */
  atrMax: number;
  sessionOnly: boolean;
  requireH4: boolean;
  requireD1: boolean;
  bodyRatio: number;
  swing: number;
}

export const MIN_RR = 2;

export const RULE_TEXT =
  "Chart is OANDA:XAUUSD. Long only above the 200 EMA after price reclaims the 20 EMA on a bullish close. Short only below the 200 EMA after price loses the 20 EMA on a bearish close. Exact entry is that close. Stop is beyond the signal wick and must be 50 pips or less. Target is exactly twice the stop.";

export const LIVE_CONFIG: ModelConfig = {
  tpR: MIN_RR,
  fixedTpPips: null,
  minRisk: 1,
  maxRisk: 5,
  buffer: 0.3,
  atrMax: 99,
  sessionOnly: true,
  requireH4: true,
  requireD1: false,
  bodyRatio: 0.4,
  swing: 3,
};

export interface ExactTrade {
  id: string;
  timeframe: EntryTf;
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  stopPips: number;
  tpPips: number;
  rr: number;
  status: "open" | "win" | "loss";
  openedAt: number;
  closedAt: number | null;
  reason: string;
}

export interface Level {
  price: number;
  time: number;
  label: string;
}

export interface ScanResult {
  biasH1: Bias;
  biasH4: Bias;
  biasD1: Bias;
  trades: ExactTrade[];
  live: ExactTrade | null;
  aLevels: Level[];
  vLevels: Level[];
  stats: {
    wins: number;
    losses: number;
    open: number;
    winRate: number | null;
    decided: number;
  };
}

interface Swing {
  index: number;
  time: number;
  price: number;
  type: "high" | "low";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function pips(distance: number) {
  return Math.round(Math.abs(distance) / PIP);
}

export function swingPoints(candles: Candle[], lookback: number): Swing[] {
  const swings: Swing[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let high = true;
    let low = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= c.high || candles[i + j].high > c.high) high = false;
      if (candles[i - j].low <= c.low || candles[i + j].low < c.low) low = false;
    }
    if (high) swings.push({ index: i, time: c.time, price: c.high, type: "high" });
    if (low) swings.push({ index: i, time: c.time, price: c.low, type: "low" });
  }
  return swings;
}

export function structureBias(candles: Candle[]): Bias {
  if (candles.length < 25) return "ranging";
  const swings = swingPoints(candles, 3);
  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");
  if (highs.length < 2 || lows.length < 2) return "ranging";
  const hh = highs[highs.length - 1].price > highs[highs.length - 2].price;
  const hl = lows[lows.length - 1].price > lows[lows.length - 2].price;
  const lh = highs[highs.length - 1].price < highs[highs.length - 2].price;
  const ll = lows[lows.length - 1].price < lows[lows.length - 2].price;
  if (hh && hl) return "bullish";
  if (lh && ll) return "bearish";
  return "ranging";
}

export function lastAtr(candles: Candle[]) {
  if (candles.length < 3) return 0;
  return Math.round(atrAt(candles, candles.length - 1) * 100) / 100;
}

function atrAt(candles: Candle[], index: number, period = 14) {
  const start = Math.max(1, index - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= index; i++) {
    const prev = candles[i - 1].close;
    const c = candles[i];
    sum += Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
    n += 1;
  }
  return n === 0 ? 0 : sum / n;
}

function snapLevels(
  entry: number,
  structuralStop: number,
  side: "long" | "short"
): { stopLoss: number; takeProfit: number } | null {
  const stopPips = Math.round(Math.abs(entry - structuralStop) / PIP);
  if (stopPips < 8 || stopPips > MAX_STOP_PIPS) return null;
  const risk = stopPips * PIP;
  const reward = stopPips * MIN_RR * PIP;
  if (side === "long") {
    return {
      stopLoss: round2(entry - risk),
      takeProfit: round2(entry + reward),
    };
  }
  return {
    stopLoss: round2(entry + risk),
    takeProfit: round2(entry - reward),
  };
}

function inSession(time: number, sessionOnly: boolean) {
  const d = new Date(time * 1000);
  const day = d.getUTCDay();
  const hour = d.getUTCHours();
  if (day === 6) return false;
  if (day === 0 && hour < 22) return false;
  if (!sessionOnly) return day !== 6;
  if (day === 0) return hour >= 22;
  return hour >= 7 && hour <= 20;
}

function rollingBias(candles: Candle[], window = 80): { time: number; bias: Bias }[] {
  const out: { time: number; bias: Bias }[] = [];
  const start = Math.min(window, candles.length - 1);
  for (let i = start; i < candles.length; i++) {
    const from = Math.max(0, i - window);
    out.push({ time: candles[i].time, bias: structureBias(candles.slice(from, i + 1)) });
  }
  return out;
}

function biasAt(series: { time: number; bias: Bias }[], time: number): Bias {
  let bias: Bias = "ranging";
  for (const point of series) {
    if (point.time > time) break;
    bias = point.bias;
  }
  return bias;
}

function statsOf(trades: ExactTrade[]): ScanResult["stats"] {
  const wins = trades.filter((t) => t.status === "win").length;
  const losses = trades.filter((t) => t.status === "loss").length;
  const open = trades.filter((t) => t.status === "open").length;
  const decided = wins + losses;
  return {
    wins,
    losses,
    open,
    decided,
    winRate: decided === 0 ? null : Math.round((wins / decided) * 1000) / 10,
  };
}

/**
 * Mechanical SMC sweep model.
 * Exact entry = close of the confirmation candle after a liquidity sweep.
 * Stop sits just beyond the sweep wick and is rejected if it exceeds 50 pips.
 * Ambiguous bars that touch both SL and TP count as a loss.
 */
export function scanEntries(
  candles: Candle[],
  timeframe: EntryTf,
  h1: Candle[],
  h4: Candle[],
  config: ModelConfig = LIVE_CONFIG,
  d1: Candle[] = []
): ExactTrade[] {
  const h1Bias = rollingBias(h1);
  const h4Bias = rollingBias(h4, 60);
  const d1Bias = d1.length ? rollingBias(d1, 40) : [];
  const swings = swingPoints(candles, config.swing);
  const trades: ExactTrade[] = [];
  let busyUntil = -1;

  for (let i = 30; i < candles.length - 1; i++) {
    if (i <= busyUntil) continue;
    const confirm = candles[i];
    if (!inSession(confirm.time, config.sessionOnly)) continue;

    const h1Now = biasAt(h1Bias, confirm.time);
    const h4Now = biasAt(h4Bias, confirm.time);
    if (h1Now === "ranging") continue;
    if (config.requireH4 && h4Now !== h1Now) continue;
    if (config.requireD1 && d1Bias.length && biasAt(d1Bias, confirm.time) !== h1Now) continue;

    const known = swings.filter((s) => s.index <= i - config.swing - 1 && s.index >= i - 48);
    const body = Math.abs(confirm.close - confirm.open);
    const range = confirm.high - confirm.low || 1;
    if (body / range < config.bodyRatio) continue;
    if (atrAt(candles, i) > config.atrMax) continue;

    if (h1Now === "bullish" && confirm.close > confirm.open) {
      const pools = known.filter((s) => s.type === "low" && s.price > confirm.low);
      const swept = pools.sort((a, b) => b.index - a.index)[0];
      if (!swept) continue;
      if (confirm.close <= swept.price) continue;
      const entry = round2(confirm.close);
      const snapped = snapLevels(entry, confirm.low - config.buffer, "long");
      if (!snapped) continue;
      const { stopLoss, takeProfit } = snapped;
      const resolved = resolveLong(candles, i, stopLoss, takeProfit);
      trades.push(
        trade({
          timeframe,
          side: "long",
          entry,
          stopLoss,
          takeProfit,
          openedAt: confirm.time,
          reason: `OANDA M${timeframe.replace("m", "")} bullish sweep of ${round2(swept.price)}. Entry ${entry}. Stop ${stopLoss} (${Math.round((entry - stopLoss) / PIP)} pips). Target ${takeProfit} is 1:2.`,
          ...resolved,
        })
      );
      busyUntil = resolved.exitIndex;
      continue;
    }

    if (h1Now === "bearish" && confirm.close < confirm.open) {
      const pools = known.filter((s) => s.type === "high" && s.price < confirm.high);
      const swept = pools.sort((a, b) => b.index - a.index)[0];
      if (!swept) continue;
      if (confirm.close >= swept.price) continue;
      const entry = round2(confirm.close);
      const snapped = snapLevels(entry, confirm.high + config.buffer, "short");
      if (!snapped) continue;
      const { stopLoss, takeProfit } = snapped;
      const resolved = resolveShort(candles, i, stopLoss, takeProfit);
      trades.push(
        trade({
          timeframe,
          side: "short",
          entry,
          stopLoss,
          takeProfit,
          openedAt: confirm.time,
          reason: `OANDA M${timeframe.replace("m", "")} bearish sweep of ${round2(swept.price)}. Entry ${entry}. Stop ${stopLoss} (${Math.round((stopLoss - entry) / PIP)} pips). Target ${takeProfit} is 1:2.`,
          ...resolved,
        })
      );
      busyUntil = resolved.exitIndex;
    }
  }

  return trades;
}

function trade(args: {
  timeframe: EntryTf;
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: number;
  reason: string;
  status: ExactTrade["status"];
  closedAt: number | null;
}): ExactTrade {
  const risk = Math.abs(args.entry - args.stopLoss);
  return {
    id: `${args.timeframe}-${args.side}-${args.openedAt}`,
    timeframe: args.timeframe,
    side: args.side,
    entry: args.entry,
    stopLoss: args.stopLoss,
    takeProfit: args.takeProfit,
    stopPips: pips(risk),
    tpPips: pips(Math.abs(args.takeProfit - args.entry)),
    rr: Math.round((Math.abs(args.takeProfit - args.entry) / risk) * 100) / 100,
    status: args.status,
    openedAt: args.openedAt,
    closedAt: args.closedAt,
    reason: args.reason,
  };
}

function resolveLong(
  candles: Candle[],
  entryIndex: number,
  stop: number,
  tp: number
) {
  for (let k = entryIndex + 1; k < candles.length; k++) {
    const c = candles[k];
    const hitSl = c.low <= stop;
    const hitTp = c.high >= tp;
    if (hitSl && hitTp) return { status: "loss" as const, closedAt: c.time, exitIndex: k };
    if (hitSl) return { status: "loss" as const, closedAt: c.time, exitIndex: k };
    if (hitTp) return { status: "win" as const, closedAt: c.time, exitIndex: k };
  }
  return { status: "open" as const, closedAt: null, exitIndex: candles.length - 1 };
}

function resolveShort(
  candles: Candle[],
  entryIndex: number,
  stop: number,
  tp: number
) {
  for (let k = entryIndex + 1; k < candles.length; k++) {
    const c = candles[k];
    const hitSl = c.high >= stop;
    const hitTp = c.low <= tp;
    if (hitSl && hitTp) return { status: "loss" as const, closedAt: c.time, exitIndex: k };
    if (hitSl) return { status: "loss" as const, closedAt: c.time, exitIndex: k };
    if (hitTp) return { status: "win" as const, closedAt: c.time, exitIndex: k };
  }
  return { status: "open" as const, closedAt: null, exitIndex: candles.length - 1 };
}

function emaSeries(candles: Candle[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = new Array(candles.length).fill(Number.NaN);
  if (candles.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  let value = sum / period;
  out[period - 1] = value;
  for (let i = period; i < candles.length; i++) {
    value = candles[i].close * k + value * (1 - k);
    out[i] = value;
  }
  return out;
}

/** Best walk-forward rule found under the hard constraints: OANDA, stop ≤ 50 pips, target = 2R. */
export function scanTrendReclaim(candles: Candle[], timeframe: EntryTf): ExactTrade[] {
  const ema20 = emaSeries(candles, 20);
  const ema200 = emaSeries(candles, 200);
  const trades: ExactTrade[] = [];
  let busyUntil = -1;

  for (let i = 210; i < candles.length - 1; i++) {
    if (i <= busyUntil) continue;
    if (!Number.isFinite(ema200[i]) || !Number.isFinite(ema20[i - 1])) continue;
    const candle = candles[i];
    const previous = candles[i - 1];
    let side: "long" | "short" | null = null;
    if (
      candle.close > ema200[i] &&
      previous.close < ema20[i - 1] &&
      candle.close > ema20[i] &&
      candle.close > candle.open
    ) {
      side = "long";
    } else if (
      candle.close < ema200[i] &&
      previous.close > ema20[i - 1] &&
      candle.close < ema20[i] &&
      candle.close < candle.open
    ) {
      side = "short";
    }
    if (!side) continue;

    const entry = round2(candle.close);
    const structural = side === "long" ? candle.low - 0.2 : candle.high + 0.2;
    const snapped = snapLevels(entry, structural, side);
    if (!snapped) continue;
    const resolved =
      side === "long"
        ? resolveLong(candles, i, snapped.stopLoss, snapped.takeProfit)
        : resolveShort(candles, i, snapped.stopLoss, snapped.takeProfit);
    const stopPips = Math.round(Math.abs(entry - snapped.stopLoss) / PIP);
    trades.push(
      trade({
        timeframe,
        side,
        entry,
        stopLoss: snapped.stopLoss,
        takeProfit: snapped.takeProfit,
        openedAt: candle.time,
        reason: `OANDA ${timeframe} ${side} at ${entry}. EMA20 reclaim in the EMA200 trend. Stop ${snapped.stopLoss} (${stopPips} pips). Target ${snapped.takeProfit} is 1:2.`,
        ...resolved,
      })
    );
    busyUntil = resolved.exitIndex;
  }
  return trades;
}

export function analyzeTimeframe(
  candles: Candle[],
  timeframe: EntryTf,
  h1: Candle[],
  h4: Candle[],
  d1: Candle[],
  config: ModelConfig = LIVE_CONFIG
): ScanResult {
  const trades = scanTrendReclaim(candles, timeframe).filter(
    (t) => t.stopPips <= MAX_STOP_PIPS && t.tpPips >= t.stopPips * 2
  );
  const live = [...trades].reverse().find((t) => t.status === "open") ?? null;
  const swings = swingPoints(candles, 3);
  const aLevels = swings
    .filter((s) => s.type === "high")
    .slice(-4)
    .map((s, i) => ({ price: round2(s.price), time: s.time, label: `A${i + 1}` }));
  const vLevels = swings
    .filter((s) => s.type === "low")
    .slice(-4)
    .map((s, i) => ({ price: round2(s.price), time: s.time, label: `V${i + 1}` }));

  return {
    biasH1: structureBias(h1.slice(-80)),
    biasH4: structureBias(h4.slice(-80)),
    biasD1: structureBias(d1.slice(-80)),
    trades,
    live,
    aLevels,
    vLevels,
    stats: statsOf(trades),
  };
}
