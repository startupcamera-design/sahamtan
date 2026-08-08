import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { analyzeStockWithAI, fetchLatestAICaches, type TradingPlan } from '../services/aiService';
import { StockChartModal } from './StockChartModal';
import { AIAnalysisViewer } from './AIAnalysisViewer';
import { Play, Loader2, Sparkles, AlertCircle, Bot, X, CheckCircle2, LineChart, TrendingUp, TrendingDown } from 'lucide-react';
import { CombinedAnalysisModal } from './CombinedAnalysisModal';

export interface ScreenerResult {
  ticker: string;
  lastDate: string;
  closePrice: number;
  ma50: number;
  distToMA50Pct: number;
  volume: number;
  avgVolume20: number;
  isPullbackHealthy: boolean;
  supertrendStatus?: 'green' | 'red'; // 🟢 Status Bar Terakhir SuperTrend
  aiScore?: number;
  aiAction?: string;
  tradingPlan?: TradingPlan | null;
  aiMarkdown?: string;
  isAnalyzing?: boolean;
}
// 1. Helper untuk mengambil rata-rata angka harga dari string (misal: "4.000 – 4.040" -> 4020, "3.950" -> 3950)
function parsePriceAvg(str?: string): number | null {
  if (!str) return null;
  const cleanStr = str.replace(/\./g, ''); // Hapus titik ribuan
  const matches = cleanStr.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  
  const nums = matches.map(Number);
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// 2. Helper untuk menghitung persentase perubahan dari harga Entry ke Target/SL
function getPctBadge(targetStr?: string, entryStr?: string, fallbackPrice?: number): { text: string; isPositive: boolean } | null {
  if (!targetStr) return null;
  
  // Gunakan rata-rata harga entry jika ada, jika tidak ada gunakan closePrice
  const entryPrice = parsePriceAvg(entryStr) || fallbackPrice;
  const targetPrice = parsePriceAvg(targetStr);

  if (!entryPrice || !targetPrice || entryPrice === 0) return null;

  const pct = ((targetPrice - entryPrice) / entryPrice) * 100;
  const formatted = Math.abs(pct).toFixed(1) + '%';

  return {
    text: pct >= 0 ? `+${formatted}` : `-${formatted}`,
    isPositive: pct >= 0,
  };
}
// Helper untuk menghitung status SuperTrend bar terakhir
function getLatestSuperTrendStatus(
  prices: Array<{ close: number; high: number; low: number }>,
  period = 10,
  multiplier = 1.5
): 'green' | 'red' {
  if (!prices || prices.length < period + 1) return 'green';

  const len = prices.length;
  const tr: number[] = new Array(len).fill(0);

  for (let i = 0; i < len; i++) {
    if (i === 0) {
      tr[i] = prices[i].high - prices[i].low;
    } else {
      const hl = prices[i].high - prices[i].low;
      const hc = Math.abs(prices[i].high - prices[i - 1].close);
      const lc = Math.abs(prices[i].low - prices[i - 1].close);
      tr[i] = Math.max(hl, hc, lc);
    }
  }

  const atr: number[] = new Array(len).fill(0);
  let sumTR = 0;
  for (let i = 0; i < period; i++) sumTR += tr[i];
  atr[period - 1] = sumTR / period;

  for (let i = period; i < len; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }

  const upBand: number[] = new Array(len).fill(0);
  const dnBand: number[] = new Array(len).fill(0);
  const trend: number[] = new Array(len).fill(1);

  for (let i = 0; i < len; i++) {
    if (i < period) continue;

    const hl2 = (prices[i].high + prices[i].low) / 2;
    const currentAtr = atr[i];
    const basicUp = hl2 - multiplier * currentAtr;
    const basicDn = hl2 + multiplier * currentAtr;

    const prevUp = i > period ? upBand[i - 1] : basicUp;
    const prevDn = i > period ? dnBand[i - 1] : basicDn;
    const prevClose = prices[i - 1].close;

    upBand[i] = prevClose > prevUp ? Math.max(basicUp, prevUp) : basicUp;
    dnBand[i] = prevClose < prevDn ? Math.min(basicDn, prevDn) : basicDn;

    let currentTrend = i > period ? trend[i - 1] : 1;
    if (currentTrend === -1 && prices[i].close > prevDn) {
      currentTrend = 1;
    } else if (currentTrend === 1 && prices[i].close < prevUp) {
      currentTrend = -1;
    }
    trend[i] = currentTrend;
  }

  return trend[len - 1] === 1 ? 'green' : 'red';
}

export const StockScreener: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [hasRun, setHasRun] = useState(false);

  // Param State
  const [lookbackDays, setLookbackDays] = useState(7);
  const [maxDistPct, setMaxDistPct] = useState(8);
  const [minVolume, setMinVolume] = useState(200000);

  // Modal AI States & Chart Modal State
  const [selectedStock, setSelectedStock] = useState<ScreenerResult | null>(null);
  const [selectedChartStock, setSelectedChartStock] = useState<ScreenerResult | null>(null);

  const handleRunScreener = async () => {
    setLoading(true);
    setHasRun(true);
    try {
      // 1. Eksekusi RPC Screener dari Supabase
      const { data, error } = await supabase.rpc('run_pullback_screener', {
        p_lookback_days: lookbackDays,
        p_max_dist_pct: maxDistPct / 100,
        p_min_volume: minVolume,
      });

      if (error) throw error;

      const latestDate = data && data.length > 0 ? data[0].last_date : null;

      // 2. Ambil Cache AI yang sudah ada
      let aiCacheMap: Record<string, { score: number; action: string; tradingPlan: TradingPlan | null; text: string }> = {};
      if (latestDate) {
        const caches = await fetchLatestAICaches(latestDate);
        caches.forEach((c: any) => {
          let plan: TradingPlan | null = null;
          if (c.trading_plan) {
            plan = typeof c.trading_plan === 'string' ? JSON.parse(c.trading_plan) : c.trading_plan;
          }
          aiCacheMap[c.ticker] = {
            score: c.ai_score,
            action: c.action_recommendation,
            tradingPlan: plan,
            text: c.analysis_text,
          };
        });
      }

      // 3. Ambil data historis singkat untuk hitung SuperTrend (30 candle terakhir per ticker)
      const tickers = (data || []).map((row: any) => row.ticker);
      let supertrendMap: Record<string, 'green' | 'red'> = {};

      if (tickers.length > 0) {
        const { data: priceHist } = await supabase
          .from('daily_stock_prices')
          .select('ticker, date, high, low, close')
          .in('ticker', tickers)
          .order('date', { ascending: true });

        if (priceHist) {
          const grouped: Record<string, Array<{ close: number; high: number; low: number }>> = {};
          priceHist.forEach((p) => {
            if (!grouped[p.ticker]) grouped[p.ticker] = [];
            grouped[p.ticker].push({
              close: Number(p.close),
              high: Number(p.high),
              low: Number(p.low),
            });
          });

          Object.keys(grouped).forEach((t) => {
            supertrendMap[t] = getLatestSuperTrendStatus(grouped[t], 10, 1.5);
          });
        }
      }

      // 4. Format & Gabungkan Hasil Screener
      const formattedResults: ScreenerResult[] = (data || []).map((row: any) => {
        const cached = aiCacheMap[row.ticker];
        return {
          ticker: row.ticker,
          lastDate: row.last_date,
          closePrice: Number(row.close_price),
          ma50: Number(row.ma50),
          distToMA50Pct: Number(row.dist_to_ma50_pct),
          volume: Number(row.volume),
          avgVolume20: Number(row.avg_volume_20),
          isPullbackHealthy: true,
          supertrendStatus: supertrendMap[row.ticker] || 'green',
          aiScore: cached?.score,
          aiAction: cached?.action,
          tradingPlan: cached?.tradingPlan,
          aiMarkdown: cached?.text,
        };
      });

      formattedResults.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
      setResults(formattedResults);
    } catch (err: any) {
      console.error('Screener Error:', err.message || err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeAI = async (stock: ScreenerResult) => {
    setResults((prev) =>
      prev.map((item) => (item.ticker === stock.ticker ? { ...item, isAnalyzing: true } : item))
    );

    try {
      const res = await analyzeStockWithAI({
        ticker: stock.ticker,
        last_date: stock.lastDate,
        close_price: stock.closePrice,
        ma50: stock.ma50,
        dist_to_ma50_pct: stock.distToMA50Pct,
        volume: stock.volume,
        avg_volume_20: stock.avgVolume20,
      });

      const updatedStock: ScreenerResult = {
        ...stock,
        aiScore: res.score,
        aiAction: res.action,
        tradingPlan: res.tradingPlan,
        aiMarkdown: res.analysisMarkdown,
        isAnalyzing: false,
      };

      setResults((prev) =>
        prev.map((item) => (item.ticker === stock.ticker ? updatedStock : item))
      );

      setSelectedStock(updatedStock);
    } catch (err: any) {
      alert(`⚠️ Gagal menganalisis ${stock.ticker}: ${err.message}`);
      setResults((prev) =>
        prev.map((item) => (item.ticker === stock.ticker ? { ...item, isAnalyzing: false } : item))
      );
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Parameter Control Card */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 sm:p-6 shadow-lg">
        <h2 className="text-lg sm:text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" /> Parameter Screening Pullback Sehat
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-5">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Periode Cek (Hari)</label>
            <input
              type="number"
              value={lookbackDays}
              onChange={(e) => setLookbackDays(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Max Jarak ke MA50 (%)</label>
            <input
              type="number"
              value={maxDistPct}
              onChange={(e) => setMaxDistPct(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Min Volume Harian</label>
            <input
              type="number"
              value={minVolume}
              onChange={(e) => setMinVolume(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <button
          onClick={handleRunScreener}
          disabled={loading}
          className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Running Screener...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" /> Jalankan Screener
            </>
          )}
        </button>
      </div>

      {/* Tabel Hasil Screening */}
      {hasRun && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 sm:p-6 shadow-lg">
          <h3 className="text-base sm:text-lg font-bold text-slate-100 mb-4">
            Hasil Saham Lolos Filter ({results.length})
          </h3>

          {results.length === 0 ? (
            <div className="flex items-center justify-center p-6 sm:p-8 text-slate-400 bg-slate-900/50 rounded-lg gap-2 text-xs sm:text-sm">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Tidak ada saham yang memenuhi kriteria pullback sehat saat ini.</span>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <table className="w-full text-left text-xs sm:text-sm text-slate-300">
                  <thead className="bg-slate-900/80 text-[11px] sm:text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-3 sm:px-4 py-3">Ticker</th>
                      <th className="px-3 sm:px-4 py-3">Tanggal</th>
                      <th className="px-3 sm:px-4 py-3">Harga</th>
                      <th className="px-3 sm:px-4 py-3">MA50</th>
                      <th className="px-3 sm:px-4 py-3">Jarak (%)</th>
                      <th className="px-3 sm:px-4 py-3 text-center">SuperTrend (Bar Terakhir)</th>
                      <th className="px-3 sm:px-4 py-3">Skor AI</th>
                      <th className="px-3 sm:px-4 py-3">Rekomendasi AI</th>
                      <th className="px-3 sm:px-4 py-3">Trading Plan (AI)</th>
                      <th className="px-3 sm:px-4 py-3">R:R Ratio</th>
                      <th className="px-3 sm:px-4 py-3 text-center">Aksi AI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {results.map((res) => (
                      <tr key={res.ticker} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-3 sm:px-4 py-3 font-bold text-emerald-400 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span>{res.ticker}</span>
                            <button
                              onClick={() => setSelectedChartStock(res)}
                              title="Lihat Grafik TradingView"
                              className="p-1 rounded bg-slate-700/60 hover:bg-emerald-600 text-slate-300 hover:text-white transition-colors"
                            >
                              <LineChart className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap">{res.lastDate}</td>
                        <td className="px-3 sm:px-4 py-3 font-medium text-slate-100 whitespace-nowrap">
                          {res.closePrice.toLocaleString('id-ID')}
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap">{res.ma50.toLocaleString('id-ID')}</td>
                        <td className="px-3 sm:px-4 py-3 text-sky-400 whitespace-nowrap">+{res.distToMA50Pct}%</td>

                        {/* KOLOM BARU: Status SuperTrend Bar Terakhir */}
                        <td className="px-3 sm:px-4 py-3 text-center whitespace-nowrap">
                          {res.supertrendStatus === 'green' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950 text-emerald-400 border border-emerald-700">
                              <TrendingUp className="w-3.5 h-3.5" /> HIJAU (Bullish)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950 text-rose-400 border border-rose-700">
                              <TrendingDown className="w-3.5 h-3.5" /> MERAH (Bearish)
                            </span>
                          )}
                        </td>

                        {/* Skor AI */}
                        <td className="px-3 sm:px-4 py-3 font-bold whitespace-nowrap">
                          {res.aiScore ? (
                            <span className={res.aiScore >= 75 ? 'text-emerald-400' : 'text-amber-400'}>
                              {res.aiScore} / 100
                            </span>
                          ) : (
                            <span className="text-slate-500 font-normal italic">-</span>
                          )}
                        </td>

                        {/* Rekomendasi AI */}
                        <td className="px-3 sm:px-4 py-3">
                          {res.aiAction ? (
                            <span className="px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1 w-fit whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3" /> {res.aiAction}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs italic whitespace-nowrap">Belum dianalisis</span>
                          )}
                        </td>

{/* Kolom Trading Plan (AI) dengan Persentase Loss & Profit */}
<td className="px-3 sm:px-4 py-3 text-xs leading-relaxed min-w-[220px]">
  {res.tradingPlan ? (() => {
    const entryPrice = parsePriceAvg(res.tradingPlan.entry_area) || res.closePrice;
    
    const slPct = getPctBadge(res.tradingPlan.stop_loss, res.tradingPlan.entry_area, res.closePrice);
    const tp1Pct = getPctBadge(res.tradingPlan.target_price_1, res.tradingPlan.entry_area, res.closePrice);
    const tp2Pct = getPctBadge(res.tradingPlan.target_price_2, res.tradingPlan.entry_area, res.closePrice);

    return (
      <div className="space-y-1.5 bg-slate-900/60 p-2 rounded-lg border border-slate-700/50">
        {/* Entry Area */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-emerald-400 font-semibold">Entry:</span>{' '}
            <span className="text-slate-200">{res.tradingPlan.entry_area}</span>
          </div>
        </div>

        {/* Stop Loss (SL) + % Loss */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-rose-400 font-semibold">SL:</span>{' '}
            <span className="text-slate-200">{res.tradingPlan.stop_loss}</span>
          </div>
          {slPct && (
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-800/60 shrink-0">
              {slPct.text}
            </span>
          )}
        </div>

        {/* Target Price 1 (TP1) + % Profit */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-sky-400 font-semibold">TP1:</span>{' '}
            <span className="text-slate-200">{res.tradingPlan.target_price_1}</span>
          </div>
          {tp1Pct && (
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 shrink-0">
              {tp1Pct.text}
            </span>
          )}
        </div>

        {/* Target Price 2 (TP2) + % Profit (jika ada) */}
        {res.tradingPlan.target_price_2 && (
          <div className="flex items-center justify-between gap-2 border-t border-slate-800/60 pt-1">
            <div>
              <span className="text-purple-400 font-semibold">TP2:</span>{' '}
              <span className="text-slate-200">{res.tradingPlan.target_price_2}</span>
            </div>
            {tp2Pct && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800/60 shrink-0">
                {tp2Pct.text}
              </span>
            )}
          </div>
        )}
      </div>
    );
  })() : (
    <span className="text-slate-500 italic">-</span>
  )}
</td>

                        {/* R:R Ratio */}
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                          {res.tradingPlan?.rr_ratio ? (
                            <span className="px-2 py-1 rounded bg-teal-950 text-teal-300 border border-teal-700 text-xs font-bold">
                              {res.tradingPlan.rr_ratio}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">-</span>
                          )}
                        </td>

                        {/* Aksi AI */}
                        <td className="px-3 sm:px-4 py-3 text-center whitespace-nowrap">
                          <button
                            onClick={() =>
                              res.aiMarkdown ? setSelectedStock(res) : handleAnalyzeAI(res)
                            }
                            disabled={res.isAnalyzing}
                            className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs rounded-lg shadow flex items-center justify-center gap-1.5 transition-all mx-auto disabled:opacity-50"
                          >
                            {res.isAnalyzing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : res.aiMarkdown ? (
                              <>
                                <Bot className="w-4 h-4" /> Lihat Detail AI
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" /> Generate AI
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Popup AI Viewer */}
      {selectedStock && selectedStock.aiMarkdown && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-800 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-4 sm:px-6 py-3.5 border-b border-slate-700 flex items-center justify-between bg-slate-900/90 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base sm:text-lg font-bold text-slate-100">
                  Analisis AI: <span className="text-emerald-400">{selectedStock.ticker}</span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedStock(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

{/* Quick Summary Card di Bagian Atas Modal AI */}
{selectedStock.tradingPlan && (() => {
  const slPct = getPctBadge(selectedStock.tradingPlan.stop_loss, selectedStock.tradingPlan.entry_area, selectedStock.closePrice);
  const tp1Pct = getPctBadge(selectedStock.tradingPlan.target_price_1, selectedStock.tradingPlan.entry_area, selectedStock.closePrice);

  return (
    <div className="bg-slate-900/90 border-b border-slate-700/80 p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs shrink-0">
      <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
        <span className="text-slate-400 block text-[10px]">ENTRY AREA</span>
        <span className="font-bold text-emerald-400">{selectedStock.tradingPlan.entry_area}</span>
      </div>

      <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700 flex justify-between items-end">
        <div>
          <span className="text-slate-400 block text-[10px]">STOP LOSS (SL)</span>
          <span className="font-bold text-rose-400">{selectedStock.tradingPlan.stop_loss}</span>
        </div>
        {slPct && <span className="text-[10px] font-bold text-rose-400 bg-rose-950 px-1 rounded border border-rose-800">{slPct.text}</span>}
      </div>

      <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700 flex justify-between items-end">
        <div>
          <span className="text-slate-400 block text-[10px]">TARGET PRICE 1</span>
          <span className="font-bold text-sky-400">{selectedStock.tradingPlan.target_price_1}</span>
        </div>
        {tp1Pct && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-1 rounded border border-emerald-800">{tp1Pct.text}</span>}
      </div>

      <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
        <span className="text-slate-400 block text-[10px]">R:R RATIO</span>
        <span className="font-bold text-teal-300">{selectedStock.tradingPlan.rr_ratio}</span>
      </div>
    </div>
  );
})()}

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              <AIAnalysisViewer content={selectedStock.aiMarkdown} />
            </div>

            <div className="px-4 sm:px-6 py-3 border-t border-slate-700 bg-slate-900/90 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedStock(null)}
                className="w-full sm:w-auto px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-xs rounded-lg transition-colors"
              >
                Tutup Laporan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Popup Chart TradingView */}
      {selectedChartStock && (
        <CombinedAnalysisModal
          stock={selectedChartStock}
          onClose={() => setSelectedChartStock(null)}
        />
      )}
    </div>
  );
};