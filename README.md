# Aureum — XAUUSD spot desk

Gold-only Smart Money desk for **spot XAUUSD**.

The chart is **OANDA:XAUUSD**, the same symbol used on TradingView.

## What it does

- Chart source is **OANDA:XAUUSD**, plus an **OANDA:BTCUSD** chart on 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, and 1mo
- Exact **M5 / M15 / M30** entries (one price, not a zone)
- Stop must be **50 pips or less** (1 pip = 0.1)
- Target is at least **1:2** versus that stop
- Longs only above the 200 EMA after an EMA20 reclaim. Shorts only below the 200 EMA after an EMA20 loss.
- Marks fresh Alchemist **A** resistance and **V** support from candle closes. A later wick removes the level. Gold charts run from M5 through monthly.
- Macro strip: dollar index, US 10-year, VIX, silver, and upcoming USD events
- Trade record with TP / SL counts, win rate, and a **PDF download**
- Browser journal of live signals this desk actually prints

## Win rate

The desk shows the **measured** win rate of this exact rule on OANDA history. A 1:2 target with a stop of at most 50 pips does **not** clear 70% on the loaded sample. The number on screen is the real count of TP versus SL. It is not adjusted upward.

Not financial advice.

## Run

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

`GET /api/desk` returns spot price, the three execution timeframes, macro, and the measured record.

## Free access from anywhere

While this machine is on, a Cloudflare quick tunnel can publish the app with no account and no fee:

```bash
npm run start
cloudflared tunnel --url http://127.0.0.1:43127
```

A `trycloudflare.com` URL is temporary. It keeps working after your own laptop is off, because the app is not running on that laptop. It stops when this cloud machine stops, and Cloudflare also expires quick tunnels on its own.

For a URL that stays up on its own, import the repo into [Vercel Hobby](https://vercel.com) and deploy. No paid plan is required. There is no database: the PDF and browser journal live on the device you use.
