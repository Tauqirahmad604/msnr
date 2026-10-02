"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { PriceChart } from "@/components/price-chart";
import { TradeCard } from "@/components/trade-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Candle, SmcAnalysis, Timeframe } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];

interface AnalyzeResponse {
  analysis: SmcAnalysis;
  candles: Candle[];
}

export function Analyzer() {
  const [tf, setTf] = useState<Timeframe>("1h");
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (timeframe: Timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyze?tf=${timeframe}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Analysis failed (${res.status})`);
      const json = (await res.json()) as AnalyzeResponse;
      setData(json);
      setSelectedId(json.analysis.trades[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load(tf);
    });
  }, [tf, load]);

  const analysis = data?.analysis;
  const selectedTrade =
    analysis?.trades.find((t) => t.id === selectedId) ??
    analysis?.trades[0] ??
    null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <header className="pt-8 sm:pt-12">
        <p className="font-[family-name:var(--font-display)] text-5xl tracking-tight text-[var(--ink)] sm:text-6xl md:text-7xl animate-rise">
          Aureum
        </p>
        <h1 className="mt-3 max-w-xl text-lg text-[var(--ink-soft)] sm:text-xl animate-rise-delay">
          SMC-style XAUUSD desk — structure, order blocks, FVGs, and graded
          setups with stop loss and take profit.
        </h1>
        <div className="mt-6 flex flex-wrap items-center gap-2 animate-rise-delay-2">
          {TIMEFRAMES.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tf === t ? "default" : "outline"}
              onClick={() => setTf(t)}
              className={cn(
                "rounded-lg",
                tf === t
                  ? "bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink)]"
                  : "border-[var(--line)] bg-white/60 text-[var(--ink-soft)]"
              )}
            >
              {t}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void load(tf)}
            disabled={loading || pending}
            className="gap-1.5 text-[var(--ink-soft)]"
          >
            <RefreshCw
              className={cn("size-3.5", (loading || pending) && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </header>

      {error && (
        <div className="mt-8 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}. Try refresh — if the live feed is blocked, a demo series is
          used automatically on the next attempt.
        </div>
      )}

      {loading && !analysis && (
        <div className="mt-10 space-y-4">
          <div className="h-[380px] animate-pulse rounded-2xl bg-white/50 sm:h-[460px]" />
          <div className="h-32 animate-pulse rounded-xl bg-white/50" />
        </div>
      )}

      {analysis && data && (
        <div className="mt-10 space-y-8">
          <section className="rounded-2xl border border-[var(--line)] bg-white/55 p-3 shadow-[0_30px_80px_-48px_rgba(40,36,28,0.45)] backdrop-blur-sm sm:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
              <Badge className="rounded-md bg-[var(--ink)] text-[var(--paper)]">
                {analysis.symbol}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "rounded-md border-transparent",
                  analysis.bias === "bullish" && "bg-emerald-100 text-emerald-800",
                  analysis.bias === "bearish" && "bg-rose-100 text-rose-800",
                  analysis.bias === "ranging" && "bg-slate-100 text-slate-700"
                )}
              >
                Bias · {analysis.bias}
              </Badge>
              <span className="text-sm tabular-nums text-[var(--ink)]">
                {analysis.lastPrice.toFixed(2)}
              </span>
              <span className="text-xs text-[var(--ink-mute)]">
                {analysis.source}
              </span>
            </div>
            <PriceChart
              candles={data.candles}
              orderBlocks={analysis.orderBlocks}
              fvgs={analysis.fvgs}
              trade={selectedTrade}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
                Trade setups
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Ranked by confluence score. Select a setup to plot entry, SL,
                and targets on the chart.
              </p>
              <div className="mt-4 space-y-3">
                {analysis.trades.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-white/50 px-4 py-8 text-center text-sm text-[var(--ink-soft)]">
                    No graded setup on {analysis.timeframe} right now. Switch
                    timeframe or wait for price to tap an order block / FVG.
                  </div>
                ) : (
                  analysis.trades.map((trade) => (
                    <TradeCard
                      key={trade.id}
                      trade={trade}
                      selected={selectedTrade?.id === trade.id}
                      onSelect={() => setSelectedId(trade.id)}
                    />
                  ))
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-[var(--line)] bg-white/60 p-5">
                <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
                  Market read
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
                  {analysis.summary}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Range high" value={analysis.dealingRange.high} />
                  <Stat label="Range low" value={analysis.dealingRange.low} />
                  <Stat
                    label="Equilibrium"
                    value={analysis.dealingRange.equilibrium}
                  />
                  <Stat
                    label="Zone"
                    value={analysis.dealingRange.zone}
                    raw
                  />
                </dl>
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-white/60 p-5">
                <h3 className="text-sm tracking-[0.16em] text-[var(--ink-mute)] uppercase">
                  Active levels
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-[var(--ink-soft)]">
                  <li>
                    Order blocks:{" "}
                    <span className="text-[var(--ink)]">
                      {analysis.orderBlocks.length}
                    </span>
                  </li>
                  <li>
                    Open FVGs:{" "}
                    <span className="text-[var(--ink)]">
                      {analysis.fvgs.length}
                    </span>
                  </li>
                  <li>
                    Liquidity pools:{" "}
                    <span className="text-[var(--ink)]">
                      {analysis.liquidity.length}
                    </span>
                  </li>
                  <li>
                    Structure events:{" "}
                    <span className="text-[var(--ink)]">
                      {analysis.structureEvents.length}
                    </span>
                  </li>
                </ul>
              </div>

              <p className="text-xs leading-relaxed text-[var(--ink-mute)]">
                {analysis.disclaimer}
              </p>
              <p className="text-xs leading-relaxed text-[var(--ink-mute)]">
                TradingView note: this app cannot log into your personal
                TradingView chart. It mirrors XAUUSD via live gold futures and
                applies an SMC checklist locally. Paste levels from TradingView
                alerts into your journal for cross-checks.
              </p>
            </aside>
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  raw,
}: {
  label: string;
  value: number | string;
  raw?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-[var(--ink-mute)] uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium tabular-nums text-[var(--ink)] capitalize">
        {raw || typeof value === "string" ? value : Number(value).toFixed(2)}
      </dd>
    </div>
  );
}
