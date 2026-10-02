"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TradeSetup } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TradeCardProps {
  trade: TradeSetup;
  selected: boolean;
  onSelect: () => void;
}

export function TradeCard({ trade, selected, onSelect }: TradeCardProps) {
  const isLong = trade.side === "long";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border p-4 text-left transition-all duration-300",
        "hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-24px_rgba(56,48,24,0.45)]",
        selected
          ? "border-[var(--gold)] bg-[var(--gold-soft)] shadow-[0_12px_40px_-20px_rgba(184,148,72,0.55)]"
          : "border-[var(--line)] bg-white/70"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-[var(--ink-mute)] uppercase">
            {trade.timeframe} · {trade.probability} setup
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            {isLong ? "Long" : "Short"} XAUUSD
          </h3>
        </div>
        <Badge
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium",
            isLong
              ? "bg-emerald-700 text-white"
              : "bg-rose-700 text-white"
          )}
        >
          Score {trade.score}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Level label="Entry" value={trade.entry} />
        <Level label="Stop Loss" value={trade.stopLoss} tone="risk" />
        <Level label="TP1" value={trade.takeProfit1} tone="reward" />
        <Level label="TP2" value={trade.takeProfit2} tone="reward" />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {trade.confluences.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-[var(--slate-wash)] px-2 py-0.5 text-[11px] text-[var(--ink-soft)]"
          >
            {tag}
          </span>
        ))}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
        {trade.rationale}
      </p>
      <p className="mt-2 text-xs text-[var(--ink-mute)]">
        RR {trade.riskReward1}:1 → TP1 · {trade.riskReward2}:1 → TP2 ·{" "}
        {trade.invalidation}
      </p>

      <div className="mt-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-0 text-[var(--gold-deep)] hover:bg-transparent hover:text-[var(--ink)]"
          tabIndex={-1}
        >
          {selected ? "Shown on chart" : "Show on chart"}
        </Button>
      </div>
    </button>
  );
}

function Level({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "risk" | "reward";
}) {
  return (
    <div>
      <p className="text-[11px] tracking-wide text-[var(--ink-mute)] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-medium tabular-nums",
          tone === "risk" && "text-rose-700",
          tone === "reward" && "text-emerald-700",
          !tone && "text-[var(--ink)]"
        )}
      >
        {value.toFixed(2)}
      </p>
    </div>
  );
}
