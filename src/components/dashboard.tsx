"use client";

import { useEffect, useMemo, useState } from "react";
import { PriceChart } from "@/components/price-chart";
import { Button } from "@/components/ui/button";
import type { ExactTrade } from "@/lib/engine";
import { downloadTradeReport } from "@/lib/report";
import type { TradeSetup } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Download, RefreshCw } from "lucide-react";

const JOURNAL_KEY = "aureum-xau-journal-v1";
const TFS = ["5m", "15m", "30m"] as const;
const CHART_TFS = ["5m", "15m", "30m", "1h", "4h", "1d", "1w", "1mo"] as const;
type Tf = (typeof TFS)[number];
type ChartTf = (typeof CHART_TFS)[number];
const BTC_TFS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1mo"] as const;
type BtcTf = (typeof BTC_TFS)[number];

const BTC_LABEL: Record<BtcTf, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1w": "1w",
  "1mo": "1mo",
};

interface Frame {
  timeframe: Tf;
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  live: ExactTrade | null;
  stats: {
    wins: number;
    losses: number;
    open: number;
    decided: number;
    winRate: number | null;
  };
  aLevels: { price: number; time: number; label: string }[];
  vLevels: { price: number; time: number; label: string }[];
  recent: ExactTrade[];
  atr: number;
  biasH1: string;
  biasH4: string;
  biasD1: string;
}

interface ChartFrame {
  timeframe: ChartTf;
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  aLevels: { price: number; time: number; label: string }[];
  vLevels: { price: number; time: number; label: string }[];
  atr: number;
}

interface BtcFrame {
  timeframe: BtcTf;
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  aLevels: { price: number; time: number; label: string }[];
  vLevels: { price: number; time: number; label: string }[];
  atr: number;
}

interface BtcDesk {
  symbol: "BTCUSD";
  spot: number;
  source: string;
  frames: BtcFrame[];
  updatedAt: number;
}

interface Desk {
  symbol: "XAUUSD";
  spot: number;
  futures: number;
  basis: number;
  source: string;
  rule: string;
  macro: {
    quotes: { symbol: string; name: string; price: number; changePercent: number }[];
    events: {
      title: string;
      country: string;
      date: string;
      impact: string;
      forecast: string;
      previous: string;
    }[];
    calendarNote: string;
    implication: string;
  };
  frames: Frame[];
  charts: ChartFrame[];
  updatedAt: number;
}

function pips(priceDistance: number) {
  return Math.round(Math.abs(priceDistance) / 0.1);
}

function readJournal(): ExactTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    return raw ? (JSON.parse(raw) as ExactTrade[]) : [];
  } catch {
    return [];
  }
}

function asideReason(frame: Frame) {
  if (frame.biasH1 === "ranging") return "H1 structure is ranging. No exact entry.";
  if (frame.biasH1 !== frame.biasH4) return "H1 and H4 disagree. Standing aside.";
  return "No EMA20 reclaim in the EMA200 trend with a stop of 50 pips or less.";
}

function toSetup(trade: ExactTrade): TradeSetup {
  return {
    id: trade.id,
    side: trade.side,
    bias: trade.side === "long" ? "bullish" : "bearish",
    entry: trade.entry,
    stopLoss: trade.stopLoss,
    stopPips: trade.stopPips,
    takeProfit1: trade.takeProfit,
    takeProfit2: trade.takeProfit,
    riskReward1: trade.rr,
    riskReward2: trade.rr,
    probability: "A",
    score: trade.stopPips,
    confluences: ["Liquidity Sweep"],
    rationale: trade.reason,
    invalidation: `Stop ${trade.stopLoss.toFixed(2)}`,
    timeframe: trade.timeframe,
    createdAt: trade.openedAt * 1000,
  };
}

export function Dashboard() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tf, setTf] = useState<ChartTf>("5m");
  const [journal, setJournal] = useState<ExactTrade[]>([]);
  const [btc, setBtc] = useState<BtcDesk | null>(null);
  const [btcError, setBtcError] = useState<string | null>(null);
  const [btcLoading, setBtcLoading] = useState(true);
  const [btcTf, setBtcTf] = useState<BtcTf>("5m");

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/desk", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Desk failed");
        if (!stop) {
          setDesk(json as Desk);
          setError(null);
        }
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "Desk failed");
      } finally {
        if (!stop) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 20000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/btc", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Bitcoin chart failed");
        if (!stop) {
          setBtc(json as BtcDesk);
          setBtcError(null);
        }
      } catch (err) {
        if (!stop) setBtcError(err instanceof Error ? err.message : "Bitcoin chart failed");
      } finally {
        if (!stop) setBtcLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 20000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!desk) return;
    const saved = readJournal();
    let changed = false;
    for (const frame of desk.frames) {
      if (!frame.live) continue;
      if (!saved.some((item) => item.id === frame.live?.id)) {
        saved.push(frame.live);
        changed = true;
      }
    }
    for (const item of saved) {
      if (item.status !== "open") continue;
      const frame = desk.frames.find((candidate) => candidate.timeframe === item.timeframe);
      if (!frame) continue;
      for (const candle of frame.candles) {
        if (candle.time <= item.openedAt) continue;
        if (item.side === "long") {
          const hitSl = candle.low <= item.stopLoss;
          const hitTp = candle.high >= item.takeProfit;
          if (hitSl) {
            item.status = "loss";
            item.closedAt = candle.time;
            changed = true;
            break;
          }
          if (hitTp) {
            item.status = "win";
            item.closedAt = candle.time;
            changed = true;
            break;
          }
        } else {
          const hitSl = candle.high >= item.stopLoss;
          const hitTp = candle.low <= item.takeProfit;
          if (hitSl) {
            item.status = "loss";
            item.closedAt = candle.time;
            changed = true;
            break;
          }
          if (hitTp) {
            item.status = "win";
            item.closedAt = candle.time;
            changed = true;
            break;
          }
        }
      }
    }
    if (changed) localStorage.setItem(JOURNAL_KEY, JSON.stringify(saved));
    setJournal(saved);
  }, [desk]);

  const frame = desk?.frames.find((item) => item.timeframe === "5m") ?? null;
  const chart = desk?.charts?.find((item) => item.timeframe === tf) ?? null;
  const entry = desk?.frames.find((item) => item.timeframe === tf) ?? null;
  const liveWins = journal.filter((item) => item.status === "win").length;
  const liveLosses = journal.filter((item) => item.status === "loss").length;
  const liveDecided = liveWins + liveLosses;
  const liveRate = liveDecided === 0 ? null : Math.round((liveWins / liveDecided) * 1000) / 10;

  const marks = useMemo(() => {
    if (!chart) return [];
    return [
      ...chart.aLevels.map((level) => ({
        price: level.price,
        title: `A ${level.price.toFixed(1)}`,
        color: "rgba(154, 52, 18, 0.75)",
      })),
      ...chart.vLevels.map((level) => ({
        price: level.price,
        title: `V ${level.price.toFixed(1)}`,
        color: "rgba(15, 118, 110, 0.8)",
      })),
    ];
  }, [chart]);

  const btcFrame = btc?.frames.find((item) => item.timeframe === btcTf) ?? null;
  const btcMarks = useMemo(() => {
    if (!btcFrame) return [];
    return [
      ...btcFrame.aLevels.slice(-3).map((level) => ({
        price: level.price,
        title: `A ${level.price.toFixed(1)}`,
        color: "rgba(154, 52, 18, 0.75)",
      })),
      ...btcFrame.vLevels.slice(-3).map((level) => ({
        price: level.price,
        title: `V ${level.price.toFixed(1)}`,
        color: "rgba(15, 118, 110, 0.8)",
      })),
    ];
  }, [btcFrame]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-8">
        <div>
          <p className="font-[family-name:var(--font-display)] text-5xl tracking-tight text-[var(--ink)] sm:text-6xl">
            Aureum
          </p>
          <h1 className="mt-2 max-w-xl text-base text-[var(--ink-soft)] sm:text-lg">
            OANDA gold and Bitcoin. A and V levels follow Alchemist SNR: candle closes only, and only while they are still fresh.
          </h1>
        </div>
        <div className="flex flex-wrap gap-6 text-right">
          <div>
            <p className="text-xs tracking-[0.16em] text-[var(--ink-mute)] uppercase">OANDA:XAUUSD</p>
            <p className="font-[family-name:var(--font-display)] text-4xl tabular-nums text-[var(--ink)]">
              {desk ? desk.spot.toFixed(2) : "—"}
            </p>
            <p className="text-xs text-[var(--ink-mute)]">
              {desk ? desk.source : "Loading OANDA"}
            </p>
          </div>
          <div>
            <p className="text-xs tracking-[0.16em] text-[var(--ink-mute)] uppercase">OANDA:BTCUSD</p>
            <p className="font-[family-name:var(--font-display)] text-4xl tabular-nums text-[var(--ink)]">
              {btc ? btc.spot.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
            </p>
            <p className="text-xs text-[var(--ink-mute)]">
              {btc ? btc.source : "Loading Bitcoin"}
            </p>
          </div>
        </div>
      </header>

      {desk && (
        <p className="mt-3 max-w-3xl text-sm text-[var(--ink-soft)]">{desk.source}</p>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading && !desk && (
        <div className="mt-8 h-[420px] animate-pulse rounded-2xl bg-white/50" />
      )}

      {desk && frame && (
        <div className="mt-8 space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {desk.macro.quotes.map((quote) => (
              <article key={quote.symbol} className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3">
                <p className="text-[11px] tracking-wide text-[var(--ink-mute)] uppercase">{quote.name}</p>
                <p className="mt-1 text-xl tabular-nums text-[var(--ink)]">{quote.price}</p>
                <p className={cn("text-sm tabular-nums", quote.changePercent >= 0 ? "text-emerald-700" : "text-rose-700")}>
                  {quote.changePercent >= 0 ? "+" : ""}
                  {quote.changePercent}%
                </p>
              </article>
            ))}
          </section>

          <p className="rounded-xl border border-[var(--line)] bg-[var(--gold-soft)] px-4 py-3 text-sm text-[var(--ink)]">
            {desk.macro.implication}
          </p>

          <section className="rounded-2xl border border-[var(--line)] bg-white/60 p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {CHART_TFS.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={tf === item ? "default" : "outline"}
                  onClick={() => setTf(item)}
                  className={cn(
                    "rounded-lg",
                    tf === item
                      ? "bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink)]"
                      : "border-[var(--line)] bg-white/70"
                  )}
                >
                  {item}
                </Button>
              ))}
              <span className="text-xs text-[var(--ink-mute)]">
                H1 {frame.biasH1} · H4 {frame.biasH4} · D1 {frame.biasD1}
                {chart ? ` · ATR ${pips(chart.atr)} pips` : ""}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto gap-1.5"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="size-3.5" />
                Refresh
              </Button>
            </div>
            {chart && (
              <PriceChart
                candles={chart.candles}
                trade={entry?.live ? toSetup(entry.live) : null}
                marks={marks}
              />
            )}
            <p className="mt-2 px-1 text-xs text-[var(--ink-mute)]">
              A is a bullish close followed by a bearish candle. V is a bearish close followed by a bullish candle. The line is that close. A wick touch removes it.
            </p>
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-white/60 p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] tracking-[0.16em] text-[var(--ink-mute)] uppercase">OANDA:BTCUSD</p>
                <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">Bitcoin</h2>
              </div>
              {btcFrame && (
                <p className="text-xs text-[var(--ink-mute)]">ATR {btcFrame.atr.toFixed(1)}</p>
              )}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {BTC_TFS.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={btcTf === item ? "default" : "outline"}
                  onClick={() => setBtcTf(item)}
                  className={cn(
                    "rounded-lg",
                    btcTf === item
                      ? "bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink)]"
                      : "border-[var(--line)] bg-white/70"
                  )}
                >
                  {BTC_LABEL[item]}
                </Button>
              ))}
            </div>
            {btcError && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {btcError}
              </p>
            )}
            {btcLoading && !btc && (
              <div className="h-[380px] animate-pulse rounded-2xl bg-white/50 sm:h-[460px]" />
            )}
            {btcFrame && (
              <PriceChart candles={btcFrame.candles} marks={btcMarks} />
            )}
            <p className="mt-2 px-1 text-xs text-[var(--ink-mute)]">
              Same Alchemist rule as gold. A and V are fresh closes. A later wick removes the line.
            </p>
          </section>

          <section className="grid gap-3 lg:grid-cols-3">
            {desk.frames.map((item) => (
              <SignalCard key={item.timeframe} frame={item} active={item.timeframe === tf} onPick={() => setTf(item.timeframe)} />
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-xl border border-[var(--line)] bg-white/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
                  Trade record
                </h2>
                <Button
                  size="sm"
                  className="gap-1.5 bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink)]"
                  onClick={() =>
                    void downloadTradeReport({
                      spot: desk.spot,
                      journal,
                      frames: desk.frames,
                      rule: desk.rule,
                    })
                  }
                >
                  <Download className="size-3.5" />
                  Download PDF
                </Button>
              </div>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">{desk.rule}</p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                {desk.frames.map((item) => (
                  <div key={item.timeframe} className="rounded-lg bg-[var(--slate-wash)] px-3 py-2">
                    <p className="text-[11px] tracking-wide text-[var(--ink-mute)] uppercase">{item.timeframe} record</p>
                    <p className="mt-1 text-lg tabular-nums text-[var(--ink)]">
                      {item.stats.winRate == null ? "—" : `${item.stats.winRate}%`}
                    </p>
                    <p className="text-xs text-[var(--ink-soft)]">
                      {item.stats.wins} TP · {item.stats.losses} SL · {item.stats.decided} closed
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--ink-mute)]">
                Same rules on every row: OANDA prices, stop at most 50 pips, target exactly twice the stop. No tested rule, including published gold SMC systems, held a win rate above 70% on the later half of this history. This table is the real count.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] tracking-wide text-[var(--ink-mute)] uppercase">
                    <tr>
                      <th className="py-2 pr-3">When</th>
                      <th className="py-2 pr-3">TF</th>
                      <th className="py-2 pr-3">Side</th>
                      <th className="py-2 pr-3">Entry</th>
                      <th className="py-2 pr-3">SL</th>
                      <th className="py-2 pr-3">TP</th>
                      <th className="py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desk.frames.flatMap((item) => item.recent).slice(0, 12).map((trade) => (
                      <tr key={trade.id} className="border-t border-[var(--line)]">
                        <td className="py-2 pr-3 tabular-nums text-[var(--ink-soft)]">
                          {new Date(trade.openedAt * 1000).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3">{trade.timeframe}</td>
                        <td className="py-2 pr-3 capitalize">{trade.side}</td>
                        <td className="py-2 pr-3 tabular-nums">{trade.entry.toFixed(2)}</td>
                        <td className="py-2 pr-3 tabular-nums text-rose-700">
                          {trade.stopLoss.toFixed(2)} · {trade.stopPips}p
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-emerald-700">
                          {trade.takeProfit.toFixed(2)} · {trade.tpPips}p
                        </td>
                        <td className="py-2 uppercase">{trade.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--line)] bg-white/70 p-5">
                <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
                  This browser
                </h2>
                <p className="mt-2 text-3xl tabular-nums text-[var(--ink)]">
                  {liveRate == null ? "No closed signals yet" : `${liveRate}%`}
                </p>
                <p className="text-sm text-[var(--ink-soft)]">
                  {liveWins} TP · {liveLosses} SL · {journal.filter((item) => item.status === "open").length} open
                </p>
                <p className="mt-2 text-xs text-[var(--ink-mute)]">
                  Saved on this device when Aureum prints a live entry, then marked TP or SL from later candles.
                </p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white/70 p-5">
                <h2 className="text-sm tracking-[0.16em] text-[var(--ink-mute)] uppercase">USD calendar</h2>
                <p className="mt-1 text-xs text-[var(--ink-mute)]">{desk.macro.calendarNote}</p>
                <ul className="mt-3 space-y-3">
                  {desk.macro.events.length === 0 && (
                    <li className="text-sm text-[var(--ink-soft)]">No upcoming USD events in the free calendar feed.</li>
                  )}
                  {desk.macro.events.map((event) => (
                    <li key={`${event.date}-${event.title}`}>
                      <p className="text-sm text-[var(--ink)]">{event.title}</p>
                      <p className="text-xs text-[var(--ink-mute)]">
                        {event.impact} · {new Date(event.date).toLocaleString()}
                        {event.forecast ? ` · forecast ${event.forecast}` : ""}
                        {event.previous ? ` · prev ${event.previous}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SignalCard({
  frame,
  active,
  onPick,
}: {
  frame: Frame;
  active: boolean;
  onPick: () => void;
}) {
  const trade = frame.live;
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "rounded-xl border p-4 text-left",
        active ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--line)] bg-white/70"
      )}
    >
      <p className="text-xs tracking-[0.16em] text-[var(--ink-mute)] uppercase">{frame.timeframe}</p>
      {trade ? (
        <>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl capitalize text-[var(--ink)]">
            {trade.side} {trade.entry.toFixed(2)}
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-[11px] uppercase text-[var(--ink-mute)]">Stop</dt>
              <dd className="tabular-nums text-rose-700">
                {trade.stopLoss.toFixed(2)} · {trade.stopPips} pips
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-[var(--ink-mute)]">Target</dt>
              <dd className="tabular-nums text-emerald-700">
                {trade.takeProfit.toFixed(2)} · {trade.tpPips} pips
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">{trade.reason}</p>
        </>
      ) : (
        <>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">Stand aside</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{asideReason(frame)}</p>
        </>
      )}
    </button>
  );
}
