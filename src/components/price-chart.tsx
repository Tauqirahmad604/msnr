"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from "lightweight-charts";
import type {
  Candle,
  FairValueGap,
  OrderBlock,
  TradeSetup,
} from "@/lib/types";

interface ChartMark {
  price: number;
  time: number;
  title: string;
  color: string;
  width?: 1 | 2 | 3 | 4;
}

interface PriceChartProps {
  candles: Candle[];
  orderBlocks?: OrderBlock[];
  fvgs?: FairValueGap[];
  trade?: TradeSetup | null;
  marks?: ChartMark[];
}

export function PriceChart({
  candles,
  orderBlocks = [],
  fvgs = [],
  trade,
  marks = [],
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const raysRef = useRef<ISeriesApi<"Line">[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#4a5568",
        fontFamily: "var(--font-sans), sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(74, 85, 104, 0.08)" },
        horzLines: { color: "rgba(74, 85, 104, 0.08)" },
      },
      rightPriceScale: {
        borderColor: "rgba(74, 85, 104, 0.15)",
      },
      timeScale: {
        borderColor: "rgba(74, 85, 104, 0.15)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "rgba(184, 148, 72, 0.45)", width: 1 },
        horzLine: { color: "rgba(184, 148, 72, 0.45)", width: 1 },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#1f7a4d",
      downColor: "#b42318",
      borderUpColor: "#1f7a4d",
      borderDownColor: "#b42318",
      wickUpColor: "#1f7a4d",
      wickDownColor: "#b42318",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
      raysRef.current = [];
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || candles.length === 0) return;

    const data: CandlestickData<Time>[] = candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    series.setData(data);

    for (const line of linesRef.current) {
      series.removePriceLine(line);
    }
    linesRef.current = [];

    const addLine = (
      price: number,
      color: string,
      title: string,
      style: 0 | 1 | 2 | 3 = 2
    ) => {
      const line = series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      linesRef.current.push(line);
    };

    if (trade) {
      addLine(trade.entry, "#b89448", "ENTRY", 0);
      addLine(trade.stopLoss, "#b42318", `SL ${trade.stopPips}p`, 2);
      addLine(trade.takeProfit1, "#1f7a4d", "TP", 2);
      if (Math.abs(trade.takeProfit2 - trade.takeProfit1) > 0.05) {
        addLine(trade.takeProfit2, "#0f766e", "TP2", 3);
      }
    }

    for (const ray of raysRef.current) {
      chart.removeSeries(ray);
    }
    raysRef.current = [];

    const firstTime = data[0].time as number;
    const lastTime = data[data.length - 1].time as number;
    for (const mark of marks) {
      const start = Math.max(mark.time, firstTime);
      if (lastTime <= start) continue;
      const ray = chart.addSeries(LineSeries, {
        color: mark.color,
        lineWidth: mark.width ?? 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: mark.title,
      });
      ray.setData([
        { time: start as Time, value: mark.price },
        { time: lastTime as Time, value: mark.price },
      ]);
      raysRef.current.push(ray);
    }

    for (const ob of orderBlocks.slice(-3)) {
      addLine(
        ob.midpoint,
        ob.direction === "bullish"
          ? "rgba(31,122,77,0.55)"
          : "rgba(180,35,24,0.55)",
        ob.direction === "bullish" ? "Bull OB" : "Bear OB",
        3
      );
    }
    for (const fvg of fvgs.slice(-2)) {
      addLine(
        fvg.midpoint,
        fvg.direction === "bullish"
          ? "rgba(15,118,110,0.45)"
          : "rgba(180,83,9,0.45)",
        "FVG",
        3
      );
    }

    chart.timeScale().fitContent();
  }, [candles, orderBlocks, fvgs, trade, marks]);

  return (
    <div
      ref={containerRef}
      className="h-[380px] w-full sm:h-[460px] lg:h-[520px]"
      aria-label="XAUUSD candlestick chart"
    />
  );
}
