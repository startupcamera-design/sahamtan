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
import { X, Loader2, BarChart2, Sparkles, CheckCircle2 } from 'lucide-react';

interface StockChartModalProps {
  stock: ScreenerResult;
  onClose: () => void;
}

// ==========================================
// FUNGSIONALITAS PERHITUNGAN SUPERTREND (PINE SCRIPT TO TS)
// ==========================================
function calculateSuperTrend(
  data: Array<{ time: string; open: number; high: number; low: number; close: number }>,
  period = 10,
  multiplier = 1.5,
  useWilderATR = true // Default true seperti 'changeATR = true' di Pine Script v4
) {
  if (data.length < period + 1) return { supertrendData: [], markers: [] };

  const len = data.length;

  // 1. Hitung True Range (TR)
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

  // 2. Hitung ATR (Wilder / RMA versi TradingView)
  const atr: number[] = new Array(len).fill(0);
  if (useWilderATR) {
    let sumTR = 0;
    for (let i = 0; i < period; i++) sumTR += tr[i];
    atr[period - 1] = sumTR / period; // SMA awal sebagai seed

    for (let i = period; i < len; i++) {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period; // RMA / Wilder's MA
    }
  } else {
    // SMA Fallback jika changeATR = false
    for (let i = period - 1; i < len; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += tr[j];
      atr[i] = sum / period;
    }
  }

  // 3. Simpan Array Band & Trend per Bar
  const upBand: number[] = new Array(len).fill(0);
  const dnBand: number[] = new Array(len).fill(0);
  const trend: number[] = new Array(len).fill(1); // 1 = Up, -1 = Down

  const supertrendData: Array<{ time: Time; value: number; color: string }> = [];
  const markers: Array<SeriesMarker<Time>> = [];

  for (let i = 0; i < len; i++) {
    if (i < period) continue;

    const hl2 = (data[i].high + data[i].low) / 2;
    const currentAtr = atr[i];

    // Band Dasar
    const basicUp = hl2 - multiplier * currentAtr;
    const basicDn = hl2 + multiplier * currentAtr;

    // Ambil Nilai Baris Sebelumnya (nz(up[1], up))
    const prevUp = i > period ? upBand[i - 1] : basicUp;
    const prevDn = i > period ? dnBand[i - 1] : basicDn;
    const prevClose = data[i - 1].close;

    // Up Band Trailing Limit
    upBand[i] = prevClose > prevUp ? Math.max(basicUp, prevUp) : basicUp;

    // Down Band Trailing Limit
    dnBand[i] = prevClose < prevDn ? Math.min(basicDn, prevDn) : basicDn;

    // Evaluasi Trend Sesuai Pine Script
    let currentTrend = i > period ? trend[i - 1] : 1;
    if (currentTrend === -1 && data[i].close > prevDn) {
      currentTrend = 1;
    } else if (currentTrend === 1 && data[i].close < prevUp) {
      currentTrend = -1;
    }
    trend[i] = currentTrend;

    // Nilai SuperTrend yang di-plot
    const val = currentTrend === 1 ? upBand[i] : dnBand[i];
    const color = currentTrend === 1 ? '#10b981' : '#ef4444';

    supertrendData.push({
      time: data[i].time as Time,
      value: Number(val.toFixed(2)),
      color: color,
    });

    // Sinyal Marker BUY / SELL
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

export const StockChartModal: React.FC<StockChartModalProps> = ({ stock, onClose }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let chart: IChartApi | null = null;

    const fetchAndRenderChart = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        // 1. Ambil 300 data OHLCV
        const { data, error } = await supabase
          .from('daily_stock_prices')
          .select('date, open, high, low, close, volume')
          .eq('ticker', stock.ticker)
          .order('date', { ascending: false })
          .limit(300);

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Data historis tidak ditemukan.');
        }

        const chronologicalData = [...data].reverse();

        if (!chartContainerRef.current) return;

        // 2. Inisialisasi Chart TradingView
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
          height: 440,
          timeScale: {
            borderColor: '#334155',
            timeVisible: true,
          },
        });

        // 3. Candlestick Series
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

        // 4. Volume Series
        const volumeSeries = chart.addSeries(HistogramSeries, {
          color: '#38bdf8',
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        });

        volumeSeries.priceScale().applyOptions({
          scaleMargins: {
            top: 0.8,
            bottom: 0,
          },
        });

        const volumeData = chronologicalData.map((d) => ({
          time: d.date as Time,
          value: Number(d.volume),
          color: Number(d.close) >= Number(d.open) ? '#10b98160' : '#ef444460',
        }));

        volumeSeries.setData(volumeData);

        // ==========================================
        // 5. RENDERING INDIKATOR SUPERTREND
        // ==========================================
        const rawOhlc = chronologicalData.map((d) => ({
          time: d.date,
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
        }));

        const { supertrendData, markers } = calculateSuperTrend(rawOhlc, 10, 1.5);

        // Tambahkan Garis SuperTrend
        const supertrendSeries = chart.addSeries(LineSeries, {
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        });

        supertrendSeries.setData(supertrendData);


        // 6. DRAW GARIS TRADING PLAN AI JIKA ADA
        if (stock.tradingPlan) {
          const parsePrices = (str?: string) => {
            if (!str) return [];
            const cleanStr = str.replace(/\./g, '');
            const matches = cleanStr.match(/\d+/g);
            return matches ? matches.map(Number) : [];
          };

          const entryPrices = parsePrices(stock.tradingPlan.entry_area);
          const slPrices = parsePrices(stock.tradingPlan.stop_loss);
          const tp1Prices = parsePrices(stock.tradingPlan.target_price_1);
          const tp2Prices = parsePrices(stock.tradingPlan.target_price_2);

          // Entry Line
          entryPrices.forEach((price) => {
            candlestickSeries.createPriceLine({
              price,
              color: '#10b981',
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
            });
          });

          // SL Line
          slPrices.forEach((price) => {
            candlestickSeries.createPriceLine({
              price,
              color: '#f43f5e',
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
            });
          });

          // TP1 Line
          tp1Prices.forEach((price) => {
            candlestickSeries.createPriceLine({
              price,
              color: '#0284c7',
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
            });
          });

          // TP2 Line
          tp2Prices.forEach((price) => {
            candlestickSeries.createPriceLine({
              price,
              color: '#8b5cf6',
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
            });
          });
        }

        chart.timeScale().fitContent();
      } catch (err: any) {
        console.error('Chart Error:', err);
        setErrorMsg(err.message || 'Gagal memuat chart');
      } finally {
        setLoading(false);
      }
    };

    fetchAndRenderChart();

    const handleResize = () => {
      if (chart && chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chart) chart.remove();
    };
  }, [stock]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <BarChart2 className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              Grafik Saham: <span className="text-emerald-400">{stock.ticker}</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Modal dengan Indikator Overlay */}
        <div className="p-6 relative bg-slate-900/60 min-h-[460px]">
          {/* Overlay Informasi AI jika data AI tersedia */}
          {(stock.aiScore || stock.aiAction || stock.tradingPlan) && (
            <div className="absolute top-8 left-8 z-10 bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 shadow-lg backdrop-blur-md max-w-xs space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 gap-4">
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <Sparkles className="w-3.5 h-3.5" /> Analisis AI
                </span>
                {stock.aiScore && (
                  <span className="bg-emerald-950 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded font-extrabold">
                    {stock.aiScore}/100
                  </span>
                )}
              </div>

              {stock.aiAction && (
                <div className="flex items-center gap-1 text-slate-300 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> {stock.aiAction}
                </div>
              )}

              {/* Legend Petunjuk Garis Harga & SuperTrend */}
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
          )}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-20 text-slate-300 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span>Memuat Grafik Candlestick & SuperTrend...</span>
            </div>
          )}

          {errorMsg && (
            <div className="absolute inset-0 flex items-center justify-center text-rose-400 text-sm">
              ⚠️ {errorMsg}
            </div>
          )}

          <div ref={chartContainerRef} className="w-full h-[440px]" />
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-700 bg-slate-900/80 flex justify-between items-center text-xs text-slate-400">
          <span>💡 Indikator SuperTrend (Line & Panah BUY/SELL) aktif di atas chart.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium rounded-lg transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};