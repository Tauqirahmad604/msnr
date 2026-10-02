import type {
  Candle,
  ConfluenceTag,
  DealingRange,
  FairValueGap,
  LiquidityPool,
  OrderBlock,
  SmcAnalysis,
  StructureBias,
  StructureEvent,
  SwingPoint,
  Timeframe,
  TradeSetup,
} from "@/lib/types";

const SWING_LOOKBACK = 3;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function findSwingPoints(candles: Candle[]): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = SWING_LOOKBACK; i < candles.length - SWING_LOOKBACK; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= SWING_LOOKBACK; j++) {
      if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) {
        isHigh = false;
      }
      if (candles[i - j].low <= c.low || candles[i + j].low <= c.low) {
        isLow = false;
      }
    }
    if (isHigh) {
      swings.push({
        index: i,
        time: c.time,
        price: c.high,
        type: "high",
      });
    }
    if (isLow) {
      swings.push({
        index: i,
        time: c.time,
        price: c.low,
        type: "low",
      });
    }
  }
  return swings;
}

function detectStructure(
  candles: Candle[],
  swings: SwingPoint[]
): { bias: StructureBias; events: StructureEvent[] } {
  const events: StructureEvent[] = [];
  let lastHigh: SwingPoint | null = null;
  let lastLow: SwingPoint | null = null;
  let trend: StructureBias = "ranging";

  for (const swing of swings) {
    if (swing.type === "high") {
      if (lastHigh && swing.price > lastHigh.price) {
        const kind: StructureEvent["kind"] =
          trend === "bearish" ? "CHoCH" : "BOS";
        events.push({
          index: swing.index,
          time: swing.time,
          price: swing.price,
          kind,
          direction: "bullish",
        });
        trend = "bullish";
      }
      lastHigh = swing;
    } else {
      if (lastLow && swing.price < lastLow.price) {
        const kind: StructureEvent["kind"] =
          trend === "bullish" ? "CHoCH" : "BOS";
        events.push({
          index: swing.index,
          time: swing.time,
          price: swing.price,
          kind,
          direction: "bearish",
        });
        trend = "bearish";
      }
      lastLow = swing;
    }
  }

  // Confirm with recent closes vs last swings
  const recent = candles.slice(-8);
  if (lastHigh && lastLow) {
    const lastClose = candles[candles.length - 1].close;
    if (lastClose > lastHigh.price * 0.998) trend = "bullish";
    else if (lastClose < lastLow.price * 1.002) trend = "bearish";
    else if (
      recent.every((c) => c.close < lastHigh.price && c.close > lastLow.price)
    ) {
      // keep last trend unless flat
      const net = recent[recent.length - 1].close - recent[0].open;
      if (Math.abs(net) < (lastHigh.price - lastLow.price) * 0.08) {
        trend = "ranging";
      }
    }
  }

  return { bias: trend, events };
}

function detectOrderBlocks(candles: Candle[]): OrderBlock[] {
  const blocks: OrderBlock[] = [];
  for (let i = 2; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    const next = candles[i + 1];
    const body = Math.abs(cur.close - cur.open);
    const range = cur.high - cur.low || 1;
    const impulseUp =
      next.close > cur.high &&
      next.close - cur.close > body * 1.2 &&
      cur.close < cur.open;
    const impulseDown =
      next.close < cur.low &&
      cur.close - next.close > body * 1.2 &&
      cur.close > cur.open;

    if (impulseUp && body / range > 0.35) {
      blocks.push({
        index: i,
        time: cur.time,
        top: Math.max(cur.open, cur.close),
        bottom: Math.min(cur.open, cur.close, cur.low),
        midpoint: (cur.high + cur.low) / 2,
        direction: "bullish",
        mitigated: false,
      });
    }
    if (impulseDown && body / range > 0.35) {
      blocks.push({
        index: i,
        time: cur.time,
        top: Math.max(cur.open, cur.close, cur.high),
        bottom: Math.min(cur.open, cur.close),
        midpoint: (cur.high + cur.low) / 2,
        direction: "bearish",
        mitigated: false,
      });
    }
  }

  // Mark mitigation and keep recent fresh blocks
  const last = candles[candles.length - 1];
  for (const ob of blocks) {
    const after = candles.slice(ob.index + 1);
    if (ob.direction === "bullish") {
      ob.mitigated = after.some((c) => c.low < ob.bottom);
    } else {
      ob.mitigated = after.some((c) => c.high > ob.top);
    }
  }

  return blocks
    .filter((b) => !b.mitigated || Math.abs(last.close - b.midpoint) / last.close < 0.01)
    .slice(-12);
}

function detectFvgs(candles: Candle[]): FairValueGap[] {
  const gaps: FairValueGap[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const left = candles[i - 1];
    const mid = candles[i];
    const right = candles[i + 1];

    // Bullish FVG: candle1 high < candle3 low
    if (left.high < right.low) {
      gaps.push({
        index: i,
        time: mid.time,
        top: right.low,
        bottom: left.high,
        midpoint: (right.low + left.high) / 2,
        direction: "bullish",
        filled: false,
      });
    }
    // Bearish FVG: candle1 low > candle3 high
    if (left.low > right.high) {
      gaps.push({
        index: i,
        time: mid.time,
        top: left.low,
        bottom: right.high,
        midpoint: (left.low + right.high) / 2,
        direction: "bearish",
        filled: false,
      });
    }
  }

  for (const gap of gaps) {
    const after = candles.slice(gap.index + 2);
    if (gap.direction === "bullish") {
      gap.filled = after.some((c) => c.low <= gap.bottom);
    } else {
      gap.filled = after.some((c) => c.high >= gap.top);
    }
  }

  return gaps.filter((g) => !g.filled).slice(-10);
}

function detectLiquidity(swings: SwingPoint[]): LiquidityPool[] {
  const pools: LiquidityPool[] = [];
  const tolerance = 0.0012; // 0.12%

  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");

  const cluster = (points: SwingPoint[], side: "buy" | "sell") => {
    const used = new Set<number>();
    for (let i = 0; i < points.length; i++) {
      if (used.has(i)) continue;
      const group = [points[i]];
      used.add(i);
      for (let j = i + 1; j < points.length; j++) {
        if (used.has(j)) continue;
        if (
          Math.abs(points[j].price - points[i].price) / points[i].price <=
          tolerance
        ) {
          group.push(points[j]);
          used.add(j);
        }
      }
      if (group.length >= 2) {
        const avg =
          group.reduce((s, p) => s + p.price, 0) / group.length;
        pools.push({
          price: round2(avg),
          side,
          touches: group.length,
          time: group[group.length - 1].time,
        });
      }
    }
  };

  cluster(highs, "sell");
  cluster(lows, "buy");
  return pools.slice(-8);
}

function dealingRangeFromSwings(
  candles: Candle[],
  swings: SwingPoint[]
): DealingRange {
  const recentSwings = swings.slice(-8);
  const highs = recentSwings.filter((s) => s.type === "high").map((s) => s.price);
  const lows = recentSwings.filter((s) => s.type === "low").map((s) => s.price);

  const high =
    highs.length > 0
      ? Math.max(...highs)
      : Math.max(...candles.slice(-40).map((c) => c.high));
  const low =
    lows.length > 0
      ? Math.min(...lows)
      : Math.min(...candles.slice(-40).map((c) => c.low));

  const equilibrium = (high + low) / 2;
  const premiumStart = equilibrium + (high - low) * 0.15;
  const discountEnd = equilibrium - (high - low) * 0.15;
  const price = candles[candles.length - 1].close;

  let zone: DealingRange["zone"] = "equilibrium";
  if (price >= premiumStart) zone = "premium";
  else if (price <= discountEnd) zone = "discount";

  return {
    high: round2(high),
    low: round2(low),
    equilibrium: round2(equilibrium),
    premiumStart: round2(premiumStart),
    discountEnd: round2(discountEnd),
    zone,
  };
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return candles[candles.length - 1].close * 0.002;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const prev = candles[i - 1];
    const c = candles[i];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    sum += tr;
  }
  return sum / period;
}

function buildTrades(
  candles: Candle[],
  timeframe: Timeframe,
  bias: StructureBias,
  range: DealingRange,
  orderBlocks: OrderBlock[],
  fvgs: FairValueGap[],
  liquidity: LiquidityPool[],
  events: StructureEvent[]
): TradeSetup[] {
  const price = candles[candles.length - 1].close;
  const volatility = atr(candles);
  const trades: TradeSetup[] = [];
  const recentEvent = events[events.length - 1];
  const unmitigatedBullOB = [...orderBlocks]
    .reverse()
    .find((o) => o.direction === "bullish" && !o.mitigated);
  const unmitigatedBearOB = [...orderBlocks]
    .reverse()
    .find((o) => o.direction === "bearish" && !o.mitigated);
  const bullFvg = [...fvgs]
    .reverse()
    .find((f) => f.direction === "bullish" && !f.filled);
  const bearFvg = [...fvgs]
    .reverse()
    .find((f) => f.direction === "bearish" && !f.filled);
  const sellLiq = liquidity
    .filter((l) => l.side === "sell")
    .sort((a, b) => a.price - b.price)
    .find((l) => l.price > price);
  const buyLiq = liquidity
    .filter((l) => l.side === "buy")
    .sort((a, b) => b.price - a.price)
    .find((l) => l.price < price);

  // LONG candidate: discount + bullish OB/FVG + bullish structure
  if (
    (bias === "bullish" || recentEvent?.direction === "bullish") &&
    (range.zone === "discount" || range.zone === "equilibrium") &&
    (unmitigatedBullOB || bullFvg)
  ) {
    const confluences: ConfluenceTag[] = ["Structure Alignment"];
    if (range.zone === "discount") confluences.push("Discount Zone");
    if (unmitigatedBullOB) confluences.push("Order Block");
    if (bullFvg) confluences.push("Fair Value Gap");
    if (recentEvent?.kind === "BOS" && recentEvent.direction === "bullish") {
      confluences.push("BOS");
    }
    if (recentEvent?.kind === "CHoCH" && recentEvent.direction === "bullish") {
      confluences.push("CHoCH");
    }
    if (buyLiq && Math.abs(price - buyLiq.price) / price < 0.004) {
      confluences.push("Liquidity Sweep");
    }

    const entryZoneTop = unmitigatedBullOB?.top ?? bullFvg?.top ?? price;
    const entryZoneBottom =
      unmitigatedBullOB?.bottom ?? bullFvg?.bottom ?? price - volatility;
    const entry = round2(
      Math.min(price, (entryZoneTop + entryZoneBottom) / 2)
    );
    const stopLoss = round2(
      Math.min(entryZoneBottom, range.low) - volatility * 0.35
    );
    const risk = entry - stopLoss;
    if (risk > 0) {
      const tp1 = round2(
        Math.min(sellLiq?.price ?? entry + risk * 2, range.equilibrium + risk)
      );
      const tp2 = round2(sellLiq?.price ?? range.high);
      const rr1 = round2((tp1 - entry) / risk);
      const rr2 = round2((tp2 - entry) / risk);
      if (rr1 >= 1.5) {
        const score = Math.min(
          98,
          55 + confluences.length * 8 + (rr1 >= 2 ? 6 : 0) + (bias === "bullish" ? 5 : 0)
        );
        trades.push({
          id: `long-${timeframe}-${candles[candles.length - 1].time}`,
          side: "long",
          bias,
          entry,
          stopLoss,
          takeProfit1: tp1,
          takeProfit2: Math.max(tp2, round2(entry + risk * 3)),
          riskReward1: rr1,
          riskReward2: Math.max(rr2, 3),
          probability: score >= 85 ? "A+" : score >= 75 ? "A" : "B",
          score,
          confluences,
          rationale: `Bullish SMC long: price in ${range.zone} of the dealing range with ${confluences.join(", ").toLowerCase()}. Entry leans into the demand zone; trail after TP1.`,
          invalidation: `Close below ${stopLoss} (beyond bullish order block / swing low).`,
          timeframe,
          createdAt: Date.now(),
        });
      }
    }
  }

  // SHORT candidate
  if (
    (bias === "bearish" || recentEvent?.direction === "bearish") &&
    (range.zone === "premium" || range.zone === "equilibrium") &&
    (unmitigatedBearOB || bearFvg)
  ) {
    const confluences: ConfluenceTag[] = ["Structure Alignment"];
    if (range.zone === "premium") confluences.push("Premium Zone");
    if (unmitigatedBearOB) confluences.push("Order Block");
    if (bearFvg) confluences.push("Fair Value Gap");
    if (recentEvent?.kind === "BOS" && recentEvent.direction === "bearish") {
      confluences.push("BOS");
    }
    if (recentEvent?.kind === "CHoCH" && recentEvent.direction === "bearish") {
      confluences.push("CHoCH");
    }
    if (sellLiq && Math.abs(price - sellLiq.price) / price < 0.004) {
      confluences.push("Liquidity Sweep");
    }

    const entryZoneBottom =
      unmitigatedBearOB?.bottom ?? bearFvg?.bottom ?? price;
    const entryZoneTop =
      unmitigatedBearOB?.top ?? bearFvg?.top ?? price + volatility;
    const entry = round2(
      Math.max(price, (entryZoneTop + entryZoneBottom) / 2)
    );
    const stopLoss = round2(
      Math.max(entryZoneTop, range.high) + volatility * 0.35
    );
    const risk = stopLoss - entry;
    if (risk > 0) {
      const tp1 = round2(
        Math.max(buyLiq?.price ?? entry - risk * 2, range.equilibrium - risk)
      );
      const tp2 = round2(buyLiq?.price ?? range.low);
      const rr1 = round2((entry - tp1) / risk);
      const rr2 = round2((entry - tp2) / risk);
      if (rr1 >= 1.5) {
        const score = Math.min(
          98,
          55 + confluences.length * 8 + (rr1 >= 2 ? 6 : 0) + (bias === "bearish" ? 5 : 0)
        );
        trades.push({
          id: `short-${timeframe}-${candles[candles.length - 1].time}`,
          side: "short",
          bias,
          entry,
          stopLoss,
          takeProfit1: tp1,
          takeProfit2: Math.min(tp2, round2(entry - risk * 3)),
          riskReward1: rr1,
          riskReward2: Math.max(rr2, 3),
          probability: score >= 85 ? "A+" : score >= 75 ? "A" : "B",
          score,
          confluences,
          rationale: `Bearish SMC short: price in ${range.zone} with ${confluences.join(", ").toLowerCase()}. Entry favors the supply zone; reduce size into TP1.`,
          invalidation: `Close above ${stopLoss} (beyond bearish order block / swing high).`,
          timeframe,
          createdAt: Date.now(),
        });
      }
    }
  }

  // If no high-confluence trade, still surface a structure-aware idea when possible
  if (trades.length === 0 && bias !== "ranging") {
    const risk = volatility * 1.1;
    if (bias === "bullish" && range.zone !== "premium") {
      const entry = round2(price);
      const stopLoss = round2(entry - risk);
      const tp1 = round2(entry + risk * 2);
      const tp2 = round2(Math.max(range.high, entry + risk * 3));
      trades.push({
        id: `long-bias-${timeframe}-${candles[candles.length - 1].time}`,
        side: "long",
        bias,
        entry,
        stopLoss,
        takeProfit1: tp1,
        takeProfit2: tp2,
        riskReward1: 2,
        riskReward2: 3,
        probability: "B",
        score: 68,
        confluences: ["Structure Alignment", "Discount Zone"].filter(
          (t, _, arr) =>
            t !== "Discount Zone" || range.zone === "discount" || arr.length > 0
        ) as ConfluenceTag[],
        rationale:
          "No fresh OB/FVG confluence yet. Bias is bullish — wait for a pullback into discount/demand before sizing up.",
        invalidation: `Structure breaks if price closes below ${stopLoss}.`,
        timeframe,
        createdAt: Date.now(),
      });
    }
    if (bias === "bearish" && range.zone !== "discount") {
      const entry = round2(price);
      const stopLoss = round2(entry + risk);
      const tp1 = round2(entry - risk * 2);
      const tp2 = round2(Math.min(range.low, entry - risk * 3));
      trades.push({
        id: `short-bias-${timeframe}-${candles[candles.length - 1].time}`,
        side: "short",
        bias,
        entry,
        stopLoss,
        takeProfit1: tp1,
        takeProfit2: tp2,
        riskReward1: 2,
        riskReward2: 3,
        probability: "B",
        score: 68,
        confluences: ["Structure Alignment", "Premium Zone"],
        rationale:
          "No fresh OB/FVG confluence yet. Bias is bearish — prefer shorts from premium/supply, not chasing mid-range.",
        invalidation: `Structure breaks if price closes above ${stopLoss}.`,
        timeframe,
        createdAt: Date.now(),
      });
    }
  }

  return trades
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function summarize(
  bias: StructureBias,
  range: DealingRange,
  trades: TradeSetup[],
  events: StructureEvent[]
): string {
  const last = events[events.length - 1];
  const structureNote = last
    ? `Latest ${last.kind} was ${last.direction} at ${last.price}.`
    : "No recent BOS/CHoCH confirmed.";
  const tradeNote =
    trades.length > 0
      ? `Top setup: ${trades[0].side.toUpperCase()} (${trades[0].probability}) with ${trades[0].riskReward1}:1 to TP1.`
      : "No A-grade setup — stand aside or wait for pullback.";
  return `Market bias is ${bias}. Price sits in the ${range.zone} zone (EQ ${range.equilibrium}). ${structureNote} ${tradeNote}`;
}

export function analyzeSmc(
  candles: Candle[],
  timeframe: Timeframe,
  meta: { symbol: string; source: string }
): SmcAnalysis {
  const swings = findSwingPoints(candles);
  const { bias, events } = detectStructure(candles, swings);
  const orderBlocks = detectOrderBlocks(candles);
  const fvgs = detectFvgs(candles);
  const liquidity = detectLiquidity(swings);
  const dealingRange = dealingRangeFromSwings(candles, swings);
  const trades = buildTrades(
    candles,
    timeframe,
    bias,
    dealingRange,
    orderBlocks,
    fvgs,
    liquidity,
    events
  );

  return {
    symbol: meta.symbol,
    source: meta.source,
    timeframe,
    lastPrice: round2(candles[candles.length - 1].close),
    bias,
    dealingRange,
    swings: swings.slice(-20),
    structureEvents: events.slice(-12),
    orderBlocks,
    fvgs,
    liquidity,
    trades,
    summary: summarize(bias, dealingRange, trades, events),
    disclaimer:
      "Educational SMC model only — not financial advice. Gold futures (GC=F) approximate XAUUSD; spreads, session gaps, and news can invalidate levels instantly. Never risk money you cannot afford to lose.",
    updatedAt: Date.now(),
  };
}
