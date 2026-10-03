export interface MacroQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
}

export interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
}

export interface MacroSnapshot {
  quotes: MacroQuote[];
  events: CalendarEvent[];
  calendarNote: string;
  implication: string;
  updatedAt: number;
}

async function yahooQuote(symbol: string, name: string): Promise<MacroQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") return null;
    return {
      symbol,
      name,
      price: Math.round(meta.regularMarketPrice * 1000) / 1000,
      changePercent: Math.round((meta.regularMarketChangePercent ?? 0) * 100) / 100,
    };
  } catch {
    return null;
  }
}

async function calendar(): Promise<{ events: CalendarEvent[]; note: string }> {
  const urls = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
  ];
  const rows: CalendarEvent[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;
      for (const item of data) {
        if (!item?.title || !item?.date) continue;
        if (item.country !== "USD") continue;
        if (item.impact !== "High" && item.impact !== "Medium") continue;
        rows.push({
          title: String(item.title),
          country: String(item.country),
          date: String(item.date),
          impact: String(item.impact),
          forecast: String(item.forecast ?? ""),
          previous: String(item.previous ?? ""),
        });
      }
    } catch {
      /* keep partial calendar */
    }
  }
  const unique = new Map<string, CalendarEvent>();
  for (const event of rows) unique.set(`${event.date}-${event.title}`, event);
  const all = [...unique.values()].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const now = Date.now() - 6 * 3600 * 1000;
  const upcoming = all.filter((event) => new Date(event.date).getTime() >= now);
  if (upcoming.length > 0) return { events: upcoming.slice(0, 6), note: "Upcoming USD releases" };
  const recent = [...all].reverse().slice(0, 5);
  return {
    events: recent,
    note: "The free calendar has no future week yet. These are the latest USD releases.",
  };
}

function implication(quotes: MacroQuote[]): string {
  const dxy = quotes.find((q) => q.symbol === "DX-Y.NYB");
  const yield10 = quotes.find((q) => q.symbol === "^TNX");
  if (!dxy || !yield10) {
    return "Macro feed incomplete. Stand aside around high-impact USD releases.";
  }
  if (dxy.changePercent > 0.15 && yield10.changePercent > 0.15) {
    return "Headwind for gold: the dollar and US 10-year yield are both firm. A short still needs price under the 200 EMA and a close that loses the 20 EMA.";
  }
  if (dxy.changePercent < -0.15 && yield10.changePercent < -0.15) {
    return "Tailwind for gold: the dollar and US 10-year yield are both soft. A long still needs price above the 200 EMA and a close that reclaims the 20 EMA.";
  }
  return "Mixed macro. The two lines on the chart are the only active A and V. A long still needs a close back above the 20 EMA while price is above the 200 EMA. A short is the mirror.";
}

export async function fetchMacro(): Promise<MacroSnapshot> {
  const [dxy, yield10, vix, silver, calendarFeed] = await Promise.all([
    yahooQuote("DX-Y.NYB", "Dollar index"),
    yahooQuote("^TNX", "US 10-year"),
    yahooQuote("^VIX", "VIX"),
    yahooQuote("SI=F", "Silver"),
    calendar(),
  ]);
  const quotes = [dxy, yield10, vix, silver].filter((q): q is MacroQuote => q !== null);
  return {
    quotes,
    events: calendarFeed.events,
    calendarNote: calendarFeed.note,
    implication: implication(quotes),
    updatedAt: Date.now(),
  };
}
