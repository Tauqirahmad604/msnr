import type { ExactTrade } from "@/lib/engine";

export interface ReportFrame {
  timeframe: string;
  stats: {
    wins: number;
    losses: number;
    open: number;
    decided: number;
    winRate: number | null;
  };
  recent: ExactTrade[];
}

function line(rows: ExactTrade[]) {
  return rows.map((trade) => {
    const when = new Date(trade.openedAt * 1000).toISOString().slice(0, 16).replace("T", " ");
    return [
      when,
      trade.timeframe,
      trade.side,
      trade.entry.toFixed(2),
      `${trade.stopLoss.toFixed(2)} (${trade.stopPips}p)`,
      `${trade.takeProfit.toFixed(2)} (${trade.tpPips}p)`,
      trade.status.toUpperCase(),
    ];
  });
}

export async function downloadTradeReport(args: {
  spot: number;
  journal: ExactTrade[];
  frames: ReportFrame[];
  rule: string;
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  let y = 48;

  const write = (text: string, size = 11, gap = 16) => {
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(text, width - 80);
    doc.text(wrapped, 40, y);
    y += wrapped.length * (size + 3) + gap - 14;
  };

  doc.setFont("times", "bold");
  write("Aureum  ·  XAUUSD trade record", 22, 22);
  doc.setFont("times", "normal");
  write(`Spot ${args.spot.toFixed(2)}   ·   ${new Date().toUTCString()}`, 11, 18);
  write(args.rule, 10, 18);

  doc.setFont("times", "bold");
  write("Measured rule record (about 60 days)", 14, 18);
  doc.setFont("times", "normal");
  for (const frame of args.frames) {
    const rate =
      frame.stats.winRate == null ? "n/a" : `${frame.stats.winRate}%`;
    write(
      `${frame.timeframe.toUpperCase()}   ${frame.stats.wins} TP   ${frame.stats.losses} SL   ${frame.stats.open} open   win rate ${rate} on ${frame.stats.decided} closed trades`,
      11,
      14
    );
  }

  y += 8;
  doc.setFont("times", "bold");
  write("Closed samples", 14, 16);
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  const samples = args.frames.flatMap((frame) => frame.recent).slice(0, 28);
  for (const row of line(samples)) {
    if (y > 760) {
      doc.addPage();
      y = 48;
    }
    doc.text(row.join("   "), 40, y);
    y += 12;
  }

  y += 16;
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  if (y > 740) {
    doc.addPage();
    y = 48;
  }
  doc.text("Signals saved in this browser", 40, y);
  y += 20;
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  const wins = args.journal.filter((t) => t.status === "win").length;
  const losses = args.journal.filter((t) => t.status === "loss").length;
  const decided = wins + losses;
  const liveRate = decided === 0 ? "n/a" : `${Math.round((wins / decided) * 1000) / 10}%`;
  const summary = doc.splitTextToSize(
    args.journal.length === 0
      ? "No live signal has been issued since this browser started tracking."
      : `${wins} TP, ${losses} SL, win rate ${liveRate} on ${decided} closed live signals.`,
    width - 80
  );
  doc.text(summary, 40, y);
  y += summary.length * 14 + 10;
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  for (const row of line(args.journal)) {
    if (y > 760) {
      doc.addPage();
      y = 48;
    }
    doc.text(row.join("   "), 40, y);
    y += 12;
  }

  y += 18;
  if (y > 760) {
    doc.addPage();
    y = 48;
  }
  doc.setFont("times", "italic");
  doc.setFontSize(9);
  const note = doc.splitTextToSize(
    "Educational record only. A past win rate is not a promise of the next trade. Gold can gap through a 50-pip stop on news.",
    width - 80
  );
  doc.text(note, 40, y);
  doc.save(`aureum-xauusd-${new Date().toISOString().slice(0, 10)}.pdf`);
}
