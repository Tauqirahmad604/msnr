# Aureum — XAUUSD spot desk

Gold-only Smart Money desk for **spot XAUUSD**.

The chart is live spot gold. Candle shape comes from COMEX futures and is shifted by the live spot-minus-futures basis, so the prices you see match XAUUSD rather than the raw futures quote.

## What it does

- Exact **M5 / M15 / M30** entries (one price, not a zone)
- Stop must be **20–50 pips** or the setup is skipped (1 pip = 0.1, so 50 pips = 5.0)
- Target is **15 pips** on a confirmed liquidity sweep
- Trades only when **H1 and H4 agree**, ATR is at most 40 pips, and it is London/New York hours
- Marks recent **A** swing highs and **V** swing lows
- Macro strip: dollar index, US 10-year, VIX, silver, and upcoming USD events
- Trade record with TP / SL counts, win rate, and a **PDF download**
- Browser journal of live signals this desk actually prints

## Win rate

The desk shows the **measured** win rate of this exact rule on the loaded history (about 60 days). On the research pass that set the rule, M5 was about **70% on 27 closed trades**, with a tiny positive average. That sample is too small to promise 70–80% going forward. If the history does not support a trade, the card says **stand aside**.

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

The `trycloudflare.com` URL stays up only as long as that process does.

For a free URL that survives restarts, import the repo into [Vercel Hobby](https://vercel.com) (free tier) and deploy. No paid plan is required for this app. There is no database: the PDF and browser journal live on the device you use.
