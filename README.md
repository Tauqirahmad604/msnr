# Aureum — XAUUSD SMC Analyzer

Educational Smart Money Concepts (SMC) desk for **XAUUSD**. It pulls live gold futures candles (COMEX `GC=F`, a close proxy for spot gold), maps structure / order blocks / fair value gaps / liquidity, and grades trade ideas with **entry, stop loss, TP1, and TP2**.

## What this is (and is not)

- **Is:** a local analyzer + chart UI you can run yourself.
- **Is not:** a live login to your personal TradingView account. TradingView does not expose private chart sessions to third-party agents. Use this beside TradingView, or mirror levels manually.

Not financial advice. Past structure does not guarantee future results.

## SMC checklist used

- Swing structure → **BOS / CHoCH** and market bias
- **Order blocks** (demand/supply from impulsive moves)
- **Fair value gaps** (3-candle imbalances)
- Equal highs/lows → **liquidity pools**
- Dealing range → **premium / equilibrium / discount**
- Setups ranked by confluence (**A+ / A / B**) with RR-based targets

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## API

`GET /api/analyze?tf=1h`

`tf` one of: `15m`, `1h`, `4h`, `1d`.

Returns candles plus the full SMC analysis payload (bias, levels, graded trades).

## Stack

Next.js, TypeScript, Tailwind, shadcn/ui, lightweight-charts, Yahoo Finance chart endpoint for gold futures.
