export type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type StructureBias = "bullish" | "bearish" | "ranging";

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: "high" | "low";
}

export interface StructureEvent {
  index: number;
  time: number;
  price: number;
  kind: "BOS" | "CHoCH";
  direction: "bullish" | "bearish";
}

export interface OrderBlock {
  index: number;
  time: number;
  top: number;
  bottom: number;
  midpoint: number;
  direction: "bullish" | "bearish";
  mitigated: boolean;
}

export interface FairValueGap {
  index: number;
  time: number;
  top: number;
  bottom: number;
  midpoint: number;
  direction: "bullish" | "bearish";
  filled: boolean;
}

export interface LiquidityPool {
  price: number;
  side: "buy" | "sell";
  touches: number;
  time: number;
}

export interface DealingRange {
  high: number;
  low: number;
  equilibrium: number;
  premiumStart: number;
  discountEnd: number;
  zone: "premium" | "equilibrium" | "discount";
}

export type ConfluenceTag =
  | "Order Block"
  | "Fair Value Gap"
  | "BOS"
  | "CHoCH"
  | "Liquidity Sweep"
  | "Discount Zone"
  | "Premium Zone"
  | "Structure Alignment";

export interface TradeSetup {
  id: string;
  side: "long" | "short";
  bias: StructureBias;
  entry: number;
  stopLoss: number;
  /** Absolute stop distance in XAUUSD pips (1.0 price = 10 pips). */
  stopPips: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward1: number;
  riskReward2: number;
  probability: "A+" | "A" | "B";
  score: number;
  confluences: ConfluenceTag[];
  rationale: string;
  invalidation: string;
  timeframe: Timeframe;
  createdAt: number;
}

export interface SmcAnalysis {
  symbol: string;
  source: string;
  timeframe: Timeframe;
  lastPrice: number;
  bias: StructureBias;
  dealingRange: DealingRange;
  swings: SwingPoint[];
  structureEvents: StructureEvent[];
  orderBlocks: OrderBlock[];
  fvgs: FairValueGap[];
  liquidity: LiquidityPool[];
  trades: TradeSetup[];
  summary: string;
  disclaimer: string;
  updatedAt: number;
}
