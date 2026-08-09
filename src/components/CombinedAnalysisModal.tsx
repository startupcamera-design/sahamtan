import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  type IChartApi,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import { supabase } from '../lib/supabase';
import type { ScreenerResult } from './StockScreener';
import { AIAnalysisViewer } from './AIAnalysisViewer';
import { X, Loader2, BarChart2, Sparkles, CheckCircle2, BookOpen } from 'lucide-react';

interface CombinedAnalysisModalProps {
  stock: ScreenerResult;
  onClose: () => void;
}

// ==========================================
// FUNGSIONALITAS SUPERTREND (ATR 10, Multiplier 1.5)
// ==========================================
function calculateSuperTrend(
  data: Array<{ time: string; open: number; high: number; low: number; close: number }>,
  period = 10,
  multiplier = 1.5,
  useWilderATR = true
) {
  if (data.length < period + 1) return { supertrendData: [], markers: [] };

  const len = data.length;

  const tr: number[] = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    if (i === 0) {
      tr[i] = data[i].high - data[i].low;
    } else {
      const hl = data[i].high - data[i].low;
      const hc = Math.abs(data[i].high - data[i - 1].close);
      const lc = Math.abs(data[i].low - data[i - 1].close);
      tr[i] = Math.max(hl, hc, lc);
    }
  }

  const atr: number[] = new Array(len).fill(0);
  if (useWilderATR) {
    let sumTR = 0;
    for (let i = 0; i < period; i++) sumTR += tr[i];
    atr[period - 1] = sumTR / period;

    for (let i = period; i < len; i++) {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }
  } else {
    for (let i = period - 1; i < len; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += tr[j];
      atr[i] = sum / period;
    }
  }

  const upBand: number[] = new Array(len).fill(0);
  const dnBand: number[] = new Array(len).fill(0);
  const trend: number[] = new Array(len).fill(1);

  const supertrendData: Array<{ time: Time; value: number; color: string }> = [];
  const markers: Array<SeriesMarker<Time>> = [];

  for (let i = 0; i < len; i++) {
    if (i < period) continue;

    const hl2 = (data[i].high + data[i].low) / 2;
    const currentAtr = atr[i];

    const basicUp = hl2 - multiplier * currentAtr;
    const basicDn = hl2 + multiplier * currentAtr;

    const prevUp = i > period ? upBand[i - 1] : basicUp;
    const prevDn = i > period ? dnBand[i - 1] : basicDn;
    const prevClose = data[i - 1].close;

    upBand[i] = prevClose > prevUp ? Math.max(basicUp, prevUp) : basicUp;
    dnBand[i] = prevClose < prevDn ? Math.min(basicDn, prevDn) : basicDn;

    let currentTrend = i > period ? trend[i - 1] : 1;
    if (currentTrend === -1 && data[i].close > prevDn) {
      currentTrend = 1;
    } else if (currentTrend === 1 && data[i].close < prevUp) {
      currentTrend = -1;
    }
    trend[i] = currentTrend;

    const val = currentTrend === 1 ? upBand[i] : dnBand[i];
    const color = currentTrend === 1 ? '#10b981' : '#ef4444';

    supertrendData.push({
      time: data[i].time as Time,
      value: Number(val.toFixed(2)),
      color: color,
    });

    const prevTrend = i > period ? trend[i - 1] : 1;
    if (currentTrend === 1 && prevTrend === -1) {
      markers.push({
        time: data[i].time as Time,
        position: 'belowBar',
        color: '#10b981',
        shape: 'arrowUp',
        text: 'BUY',
      });
    } else if (currentTrend === -1 && prevTrend === 1) {
      markers.push({
        time: data[i].time as Time,
        position: 'aboveBar',
        color: '#ef4444',
        shape: 'arrowDown',
        text: 'SELL',
      });
    }
  }

  return { supertrendData, markers };
}

// Safe Parser Angka Harga
const parsePrices = (val?: string | number | null): number[] => {
  if (val === undefined || val === null) return [];
  if (typeof val === 'number') return isNaN(val) ? [] : [val];

  const strVal = String(val).trim();
  if (!strVal) return [];

  const cleanStr = strVal.replace(/\./g, '');
  const matches = cleanStr.match(/\d+/g);
  if (!matches) return [];

  return matches.map(Number).filter((num) => !isNaN(num) && num > 0);
};

export const CombinedAnalysisModal: React.FC<CombinedAnalysisModalProps> = ({ stock, onClose }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let chart: IChartApi | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const fetchAndRenderChart = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        // OPTIMASI EGRESS: Ambil 180 baris data terbaru (cukup untuk 8-9 bulan hari bursa)
        const { data, error } = await supabase
          .from('daily_stock_prices')
          .select('date, open, high, low, close, volume')
          .eq('ticker', stock.ticker)
          .order('date', { ascending: false })
          .limit(180);

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Data historis tidak ditemukan.');
        }

        const chronologicalData = [...data].reverse();

        if (!chartContainerRef.current) return;

        chartContainerRef.current.innerHTML = '';

        const isMobile = window.innerWidth < 768;
        const chartHeight = isMobile ? 310 : 480;

        chart = createChart(chartContainerRef.current, {
          layout: {
            background: { type: ColorType.Solid, color: '#0f172a' },
            textColor: '#94a3b8',
          },
          grid: {
            vertLines: { color: '#1e293b' },
            horzLines: { color: '#1e293b' },
          },
          width: chartContainerRef.current.clientWidth,
          height: chartHeight,
          timeScale: {
            borderColor: '#334155',
            timeVisible: true,
          },
        });

        // 1. Candlestick
        const candlestickSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#10b981',
          downColor: '#ef4444',
          borderVisible: false,
          wickUpColor: '#10b981',
          wickDownColor: '#ef4444',
        });

        const candleData = chronologicalData.map((d) => ({
          time: d.date as Time,
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
        }));

        candlestickSeries.setData(candleData);

        // 2. Volume
        const volumeSeries = chart.addSeries(HistogramSeries, {
          color: '#38bdf8',
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        });

        volumeSeries.priceScale().applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        });

        const volumeData = chronologicalData.map((d) => ({
          time: d.date as Time,
          value: Number(d.volume),
          color: Number(d.close) >= Number(d.open) ? '#10b98160' : '#ef444460',
        }));

        volumeSeries.setData(volumeData);

        // 3. SuperTrend & Markers
        const rawOhlc = chronologicalData.map((d) => ({
          time: d.date,
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
        }));

        const { supertrendData, markers } = calculateSuperTrend(rawOhlc, 10, 1.5);

        const supertrendSeries = chart.addSeries(LineSeries, {
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        });

        supertrendSeries.setData(supertrendData);

        // Pengecekan Aman (Safe Call) setMarkers
        if (markers.length > 0 && typeof (candlestickSeries as any).setMarkers === 'function') {
          (candlestickSeries as any).setMarkers(markers);
        }

        // 4. GARIS TRADING PLAN (ENTRY, SL, TP1, TP2)
        const tp = stock.tradingPlan;
        if (tp) {
          const entryArea = tp.entry_area || (tp as any).entryArea;
          const stopLoss = tp.stop_loss || (tp as any).stopLoss;
          const tp1 = tp.target_price_1 || (tp as any).targetPrice1;
          const tp2 = tp.target_price_2 || (tp as any).targetPrice2;

          parsePrices(entryArea).forEach((price) => {
            candlestickSeries.createPriceLine({
              price,
              color: '#10b981',
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'ENTRY',
            });
          });

          parsePrices(stopLoss).forEach((price) => {
            candlestickSeries.createPriceLine({
              price,
              color: '#f43f5e',
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
              title: 'SL',
            });
          });

          parsePrices(tp1).forEach((price) => {
            candlestickSeries.createPriceLine({
              price,
              color: '#0284c7',
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'TP1',
            });
          });

          parsePrices(tp2).forEach((price) => {
            candlestickSeries.createPriceLine({
              price,
              color: '#8b5cf6',
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: 'TP2',
            });
          });
        }

        chart.timeScale().fitContent();

        // Responsive Resize Observer
        if (chartContainerRef.current) {
          resizeObserver = new ResizeObserver((entries) => {
            if (entries.length === 0 || !entries[0].contentRect) return;
            const newWidth = entries[0].contentRect.width;
            if (chart && newWidth > 0) {
              chart.applyOptions({ width: newWidth });
            }
          });
          resizeObserver.observe(chartContainerRef.current);
        }
      } catch (err: any) {
        console.error('Chart Error:', err);
        setErrorMsg(err.message || 'Gagal memuat grafik saham.');
      } finally {
        setLoading(false);
      }
    };

    fetchAndRenderChart();

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      if (chart) chart.remove();
    };
  }, [stock]);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-7xl rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[92vh]">
        
        {/* Header Modal */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950 shrink-0">
          <div className="flex items-center gap-2.5">
            <BarChart2 className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>Grafik & Analisis Live:</span>
              <span className="text-emerald-400 font-extrabold">{stock.ticker}</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Split Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          
          {/* KOLOM KIRI: GRAFIK */}
          <div className="lg:col-span-7 p-3 sm:p-4 relative bg-slate-950/60 flex flex-col justify-center min-h-[340px] sm:min-h-[480px]">
            
            {/* Legend Mobile / Summary Badge Bar (Khusus HP) */}
            {(stock.aiScore || stock.aiAction || stock.tradingPlan) && (
              <div className="block lg:hidden mb-2 bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-emerald-400 font-bold">
                    <Sparkles className="w-3.5 h-3.5" /> Analisis AI
                  </span>
                  <div className="flex items-center gap-2">
                    {stock.aiAction && (
                      <span className="text-[10px] bg-slate-800 text-emerald-300 px-2 py-0.5 rounded font-semibold border border-slate-700">
                        {stock.aiAction}
                      </span>
                    )}
                    {stock.aiScore && (
                      <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded font-extrabold text-[11px]">
                        {stock.aiScore}/100
                      </span>
                    )}
                  </div>
                </div>

                {stock.tradingPlan && (
                  <div className="grid grid-cols-4 gap-1 text-[10px] text-center pt-1 border-t border-slate-800">
                    <div className="bg-slate-950 p-1 rounded">
                      <span className="text-slate-500 block">ENTRY</span>
                      <strong className="text-emerald-400">{stock.tradingPlan.entry_area}</strong>
                    </div>
                    <div className="bg-slate-950 p-1 rounded">
                      <span className="text-slate-500 block">SL</span>
                      <strong className="text-rose-400">{stock.tradingPlan.stop_loss}</strong>
                    </div>
                    <div className="bg-slate-950 p-1 rounded">
                      <span className="text-slate-500 block">TP1</span>
                      <strong className="text-sky-400">{stock.tradingPlan.target_price_1}</strong>
                    </div>
                    <div className="bg-slate-950 p-1 rounded">
                      <span className="text-slate-500 block">TP2</span>
                      <strong className="text-purple-400">{stock.tradingPlan.target_price_2}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Legend Desktop Floating Overlay (Khusus Desktop) */}
            {(stock.aiScore || stock.aiAction || stock.tradingPlan) && (
              <div className="hidden lg:block absolute top-6 left-6 z-10 pointer-events-none">
                <div className="pointer-events-auto bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-xl backdrop-blur-md max-w-xs space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 gap-4">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                      <Sparkles className="w-3.5 h-3.5" /> Analisis AI
                    </span>
                    {stock.aiScore && (
                      <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-extrabold">
                        {stock.aiScore}/100
                      </span>
                    )}
                  </div>

                  {stock.aiAction && (
                    <div className="flex items-center gap-1 text-slate-300 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> {stock.aiAction}
                    </div>
                  )}

                  <div className="pt-1.5 border-t border-slate-800 space-y-1 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-0.5 bg-emerald-500 inline-block"></span>
                      <span className="text-slate-400">SuperTrend:</span>
                      <strong className="text-emerald-400">ATR(10, 1.5)</strong>
                    </div>
                    {stock.tradingPlan && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                          <span className="text-slate-400">Entry:</span>
                          <strong className="text-slate-200">{stock.tradingPlan.entry_area}</strong>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                          <span className="text-slate-400">SL:</span>
                          <strong className="text-slate-200">{stock.tradingPlan.stop_loss}</strong>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block"></span>
                          <span className="text-slate-400">TP1:</span>
                          <strong className="text-slate-200">{stock.tradingPlan.target_price_1}</strong>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block"></span>
                          <span className="text-slate-400">TP2:</span>
                          <strong className="text-slate-200">{stock.tradingPlan.target_price_2}</strong>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-20 text-slate-300 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                <span className="text-xs sm:text-sm">Memuat Grafik Candlestick...</span>
              </div>
            )}

            {errorMsg && (
              <div className="absolute inset-0 flex items-center justify-center text-rose-400 text-xs sm:text-sm p-4 text-center">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Container Grafik */}
            <div ref={chartContainerRef} className="w-full h-[310px] sm:h-[480px]" />
          </div>

          {/* KOLOM KANAN: LAPORAN AI */}
          <div className="lg:col-span-5 p-4 sm:p-5 overflow-y-auto bg-slate-900/40 max-h-[400px] lg:max-h-[580px]">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs sm:text-sm font-bold text-slate-200">Narasi Analisis AI</h4>
            </div>

            {stock.aiMarkdown ? (
              <AIAnalysisViewer content={stock.aiMarkdown} />
            ) : (
              <div className="text-slate-500 text-xs italic py-8 text-center">
                Laporan narasi AI belum tersedia untuk saham ini.
              </div>
            )}
          </div>

        </div>

        {/* Footer Modal */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] sm:text-xs text-slate-400 shrink-0">
          <span className="text-center sm:text-left">
            💡 <span className="font-semibold text-slate-300">Navigasi Chart:</span> Pinch/Scroll untuk Zoom, geser jari/mouse untuk panning.
          </span>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Tutup Modal
          </button>
        </div>

      </div>
    </div>
  );
};