import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { analyzeStockWithAI, fetchLatestAICaches, type TradingPlan } from '../services/aiService';
import { AIAnalysisViewer } from './AIAnalysisViewer';
import { 
  Play, 
  Loader2, 
  Sparkles, 
  AlertCircle, 
  Bot, 
  X, 
  CheckCircle2, 
  LineChart, 
  TrendingUp, 
  TrendingDown,
  Filter,
  ChevronDown,
  ChevronUp,
  Target,
  ShieldAlert,
  ArrowUpRight,
  Sliders,
  Cpu,
  CheckCircle,
  XCircle,
  FileText
} from 'lucide-react';
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
  supertrendStatus?: 'green' | 'red';
  aiScore?: number;
  aiAction?: string;
  tradingPlan?: TradingPlan | null;
  aiMarkdown?: string;
  isAnalyzing?: boolean;
  aiStatusText?: string;
}

// Interface khusus ringkasan sementara Batch AI (Tidak disimpan di DB)
export interface BatchSummaryItem {
  ticker: string;
  score?: number;
  action?: string;
  modelUsed: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}

// 1. Helper untuk mengambil rata-rata angka harga dari string
function parsePriceAvg(str?: string): number | null {
  if (!str) return null;
  const cleanStr = str.replace(/\./g, '');
  const matches = cleanStr.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  
  const nums = matches.map(Number);
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// 2. Helper untuk menghitung persentase perubahan
function getPctBadge(targetStr?: string, entryStr?: string, fallbackPrice?: number): { text: string; isPositive: boolean } | null {
  if (!targetStr) return null;
  
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

// 3. Helper untuk menghitung status SuperTrend
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
  const [showFilterMobile, setShowFilterMobile] = useState(true);

  // Param State Screener Database
  const [lookbackDays, setLookbackDays] = useState(7);
  const [maxDistPct, setMaxDistPct] = useState(8);
  const [minVolume, setMinVolume] = useState(200000);

  // State Filter Hasil
  const [filterSuperTrend, setFilterSuperTrend] = useState<'all' | 'green' | 'red'>('all');
  const [filterPriceRange, setFilterPriceRange] = useState<'all' | 'under500' | '500to1000' | 'over1000'>('all');

  // State Batch AI Processing & Ringkasan Laporan
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [batchProgressText, setBatchProgressText] = useState('');
  const [batchSummaryList, setBatchSummaryList] = useState<BatchSummaryItem[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);

  // Modal AI States & Chart Modal State
  const [selectedStock, setSelectedStock] = useState<ScreenerResult | null>(null);
  const [selectedChartStock, setSelectedChartStock] = useState<ScreenerResult | null>(null);

  const handleRunScreener = async () => {
    setLoading(true);
    setHasRun(true);
    try {
      const { data, error } = await supabase.rpc('run_pullback_screener', {
        p_lookback_days: lookbackDays,
        p_max_dist_pct: maxDistPct / 100,
        p_min_volume: minVolume,
      });

      if (error) throw error;

      const latestDate = data && data.length > 0 ? data[0].last_date : null;

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

      const tickers = (data || []).map((row: any) => row.ticker);
      let supertrendMap: Record<string, 'green' | 'red'> = {};

      if (tickers.length > 0 && latestDate) {
        const dateLimit = new Date(new Date(latestDate).getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const { data: priceHist } = await supabase
          .from('daily_stock_prices')
          .select('ticker, date, high, low, close')
          .in('ticker', tickers)
          .gte('date', dateLimit)
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

      if (window.innerWidth < 768) {
        setShowFilterMobile(false);
      }
    } catch (err: any) {
      console.error('Screener Error:', err.message || err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeAI = async (stock: ScreenerResult): Promise<{ res: ScreenerResult | null; modelUsed: string }> => {
    setResults((prev) =>
      prev.map((item) =>
        item.ticker === stock.ticker
          ? { ...item, isAnalyzing: true, aiStatusText: 'Menghubungkan AI...' }
          : item
      )
    );

    try {
      const res: any = await analyzeStockWithAI(
        {
          ticker: stock.ticker,
          last_date: stock.lastDate,
          close_price: stock.closePrice,
          ma50: stock.ma50,
          dist_to_ma50_pct: stock.distToMA50Pct,
          volume: stock.volume,
          avg_volume_20: stock.avgVolume20,
        },
        (statusText) => {
          setResults((prev) =>
            prev.map((item) =>
              item.ticker === stock.ticker ? { ...item, aiStatusText: statusText } : item
            )
          );
        }
      );

      const updatedStock: ScreenerResult = {
        ...stock,
        aiScore: res.score,
        aiAction: res.action,
        tradingPlan: res.tradingPlan,
        aiMarkdown: res.analysisMarkdown,
        isAnalyzing: false,
        aiStatusText: undefined,
      };

      setResults((prev) =>
        prev.map((item) => (item.ticker === stock.ticker ? updatedStock : item))
      );

      return { res: updatedStock, modelUsed: res.usedModel || 'gemini-3.6-flash' };
    } catch (err: any) {
      setResults((prev) =>
        prev.map((item) =>
          item.ticker === stock.ticker ? { ...item, isAnalyzing: false, aiStatusText: undefined } : item
        )
      );
      throw err;
    }
  };

  // ==========================================
  // BATCH AI GENERATOR BERSAMA RINGKASAN MODAL
  // ==========================================
  const handleBatchAnalyzeAI = async () => {
    const unanalyzed = filteredResults.filter((item) => !item.aiMarkdown);
    
    if (unanalyzed.length === 0) {
      alert('Semua saham pada hasil filter saat ini sudah memiliki laporan AI!');
      return;
    }

    if (!confirm(`Apakah Anda ingin menganalisis ${unanalyzed.length} saham secara otomatis bergantian?`)) {
      return;
    }

    setIsBatchAnalyzing(true);
    const summaryAccumulator: BatchSummaryItem[] = [];

    for (let i = 0; i < unanalyzed.length; i++) {
      const targetStock = unanalyzed[i];
      setBatchProgressText(`Menganalisis (${i + 1}/${unanalyzed.length}): ${targetStock.ticker}`);

      try {
        const { res, modelUsed } = await handleAnalyzeAI(targetStock);
        if (res) {
          summaryAccumulator.push({
            ticker: targetStock.ticker,
            score: res.aiScore,
            action: res.aiAction,
            modelUsed: modelUsed,
            status: 'success',
          });
        }
      } catch (err: any) {
        summaryAccumulator.push({
          ticker: targetStock.ticker,
          modelUsed: 'Gagal / Timeout',
          status: 'failed',
          errorMessage: err.message || 'Gagal memanggil API AI',
        });
      }

      // Delay 1 detik antar request agar aman dari rate limit kuota API
      if (i < unanalyzed.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    setIsBatchAnalyzing(false);
    setBatchProgressText('');
    setBatchSummaryList(summaryAccumulator);
    setShowBatchModal(true); // Tampilkan modal ringkasan
  };

  // ==========================================
  // LOGIKA PENYARINGAN FILTER HASIL
  // ==========================================
  const filteredResults = results.filter((item) => {
    // 1. Filter Khusus Ticker 4 Huruf
    if (item.ticker.length !== 4) {
      return false;
    }

    // 2. Filter SuperTrend
    if (filterSuperTrend !== 'all' && item.supertrendStatus !== filterSuperTrend) {
      return false;
    }

    // 3. Filter Range Harga
    if (filterPriceRange === 'under500' && item.closePrice >= 500) {
      return false;
    }
    if (filterPriceRange === '500to1000' && (item.closePrice < 500 || item.closePrice > 1000)) {
      return false;
    }
    if (filterPriceRange === 'over1000' && item.closePrice <= 1000) {
      return false;
    }

    return true;
  });

  const unanalyzedCount = filteredResults.filter((item) => !item.aiMarkdown).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      
      {/* ================= PANEL PARAMETER SCREENING ================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-xl font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" /> 
            <span>Parameter Screening Pullback</span>
          </h2>

          <button
            onClick={() => setShowFilterMobile(!showFilterMobile)}
            className="md:hidden flex items-center gap-1 text-xs text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700"
          >
            <Filter className="w-3.5 h-3.5 text-emerald-400" />
            <span>{showFilterMobile ? 'Sembunyikan' : 'Pengaturan'}</span>
            {showFilterMobile ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className={`mt-4 ${showFilterMobile ? 'block' : 'hidden md:block'}`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-5">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Periode Cek (Hari)
              </label>
              <input
                type="number"
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Max Jarak ke MA50 (%)
              </label>
              <input
                type="number"
                value={maxDistPct}
                onChange={(e) => setMaxDistPct(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Min Volume Harian (Lembar)
              </label>
              <input
                type="number"
                value={minVolume}
                onChange={(e) => setMinVolume(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
            </div>
          </div>

          <button
            onClick={handleRunScreener}
            disabled={loading || isBatchAnalyzing}
            className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menjalankan Screening...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Jalankan Screener Sekarang</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ================= HASIL SCREENER & FILTER TAMPILAN ================= */}
      {hasRun && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md">
          
          {/* HEADER & QUICK FILTER CONTROL */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>Saham Lolos Filter</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {filteredResults.length} Ticker
                </span>
              </h3>

              {/* TOMBOL BATCH AI GENERATOR */}
              {unanalyzedCount > 0 && (
                <button
                  onClick={handleBatchAnalyzeAI}
                  disabled={isBatchAnalyzing}
                  className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {isBatchAnalyzing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="font-mono text-[11px]">{batchProgressText}</span>
                    </>
                  ) : (
                    <>
                      <Cpu className="w-3.5 h-3.5 text-amber-200" />
                      <span>Batch AI ({unanalyzedCount} Saham)</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* DROPDOWN FILTER KECIL (SUPERTREND & RANGE HARGA) */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400 flex items-center gap-1 font-medium">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" /> Filter Tampilan:
              </span>

              {/* Filter SuperTrend */}
              <select
                value={filterSuperTrend}
                onChange={(e) => setFilterSuperTrend(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">Semua SuperTrend</option>
                <option value="green">🟢 Bullish</option>
                <option value="red">🔴 Bearish</option>
              </select>

              {/* Filter Range Harga */}
              <select
                value={filterPriceRange}
                onChange={(e) => setFilterPriceRange(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">Semua Harga</option>
                <option value="under500">Harga &lt; 500</option>
                <option value="500to1000">Harga 500 – 1.000</option>
                <option value="over1000">Harga &gt; 1.000</option>
              </select>
            </div>
          </div>

          {filteredResults.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-slate-400 bg-slate-950/60 rounded-xl gap-3 text-xs sm:text-sm border border-slate-800/80">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              <span>
                {results.length === 0
                  ? 'Tidak ada saham yang memenuhi kriteria pullback sehat pada parameter saat ini.'
                  : 'Tidak ada ticker saham 4 huruf yang sesuai dengan kombinasi filter Anda.'}
              </span>
            </div>
          ) : (
            <>
              {/* ---------------- TAMPILAN TABLE (DESKTOP) ---------------- */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm text-slate-300">
                  <thead className="bg-slate-950/80 text-[11px] uppercase text-slate-400 font-semibold tracking-wider">
                    <tr>
                      <th className="px-4 py-3.5 rounded-l-xl">Ticker</th>
                      <th className="px-4 py-3.5">Tanggal</th>
                      <th className="px-4 py-3.5">Harga</th>
                      <th className="px-4 py-3.5">MA50</th>
                      <th className="px-4 py-3.5">Jarak (%)</th>
                      <th className="px-4 py-3.5 text-center">SuperTrend</th>
                      <th className="px-4 py-3.5">Skor AI</th>
                      <th className="px-4 py-3.5">Rekomendasi</th>
                      <th className="px-4 py-3.5">Trading Plan (AI)</th>
                      <th className="px-4 py-3.5">R:R</th>
                      <th className="px-4 py-3.5 text-center rounded-r-xl">Aksi AI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredResults.map((res) => (
                      <tr key={res.ticker} className="hover:bg-slate-800/40 transition-colors">
                        
                        <td className="px-4 py-3.5 font-bold text-emerald-400 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-base tracking-wide">{res.ticker}</span>
                            <button
                              onClick={() => setSelectedChartStock(res)}
                              title="Lihat Chart & Analisis Live"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                            >
                              <LineChart className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-400 text-xs">{res.lastDate}</td>
                        <td className="px-4 py-3.5 font-semibold text-slate-100 whitespace-nowrap">
                          Rp {res.closePrice.toLocaleString('id-ID')}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-400">
                          {res.ma50.toLocaleString('id-ID')}
                        </td>
                        <td className="px-4 py-3.5 text-sky-400 font-semibold whitespace-nowrap">
                          +{res.distToMA50Pct}%
                        </td>

                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          {res.supertrendStatus === 'green' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-700/80">
                              <TrendingUp className="w-3.5 h-3.5" /> Bullish
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950/80 text-rose-400 border border-rose-700/80">
                              <TrendingDown className="w-3.5 h-3.5" /> Bearish
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 font-extrabold whitespace-nowrap">
                          {res.aiScore !== undefined ? (
                            <span className={`px-2 py-0.5 rounded-md text-xs ${
                              res.aiScore >= 75 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {res.aiScore} / 100
                            </span>
                          ) : (
                            <span className="text-slate-600 font-normal italic">-</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {res.aiAction ? (
                            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-800 text-emerald-300 border border-slate-700 flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {res.aiAction}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs italic">Belum dianalisis</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-xs min-w-[210px]">
                          {res.tradingPlan ? (() => {
                            const slPct = getPctBadge(res.tradingPlan.stop_loss, res.tradingPlan.entry_area, res.closePrice);
                            const tp1Pct = getPctBadge(res.tradingPlan.target_price_1, res.tradingPlan.entry_area, res.closePrice);

                            return (
                              <div className="space-y-1 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-emerald-400 font-semibold">Entry:</span>
                                  <span className="text-slate-200 font-medium">{res.tradingPlan.entry_area}</span>
                                </div>
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-rose-400 font-semibold">SL:</span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-200 font-medium">{res.tradingPlan.stop_loss}</span>
                                    {slPct && <span className="text-[9px] font-bold text-rose-400 bg-rose-950 px-1 rounded border border-rose-800/80">{slPct.text}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-sky-400 font-semibold">TP1:</span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-200 font-medium">{res.tradingPlan.target_price_1}</span>
                                    {tp1Pct && <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950 px-1 rounded border border-emerald-800/80">{tp1Pct.text}</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })() : (
                            <span className="text-slate-600 italic">-</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {res.tradingPlan?.rr_ratio ? (
                            <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800/80 text-xs font-bold">
                              {res.tradingPlan.rr_ratio}
                            </span>
                          ) : (
                            <span className="text-slate-600 italic">-</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <button
                            onClick={() =>
                              res.aiMarkdown ? setSelectedStock(res) : handleAnalyzeAI(res)
                            }
                            disabled={res.isAnalyzing || isBatchAnalyzing}
                            className="px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all mx-auto disabled:opacity-80 cursor-pointer active:scale-95"
                          >
                            {res.isAnalyzing ? (
                              <div className="flex items-center gap-1.5">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                                <span className="text-[10px] text-amber-200 animate-pulse font-mono">
                                  {res.aiStatusText || 'Menganalisis...'}
                                </span>
                              </div>
                            ) : res.aiMarkdown ? (
                              <>
                                <Bot className="w-4 h-4" /> Lihat AI
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

              {/* ---------------- TAMPILAN CARD GRID (MOBILE) ---------------- */}
              <div className="md:hidden space-y-3">
                {filteredResults.map((res) => {
                  const slPct = res.tradingPlan ? getPctBadge(res.tradingPlan.stop_loss, res.tradingPlan.entry_area, res.closePrice) : null;
                  const tp1Pct = res.tradingPlan ? getPctBadge(res.tradingPlan.target_price_1, res.tradingPlan.entry_area, res.closePrice) : null;

                  return (
                    <div 
                      key={res.ticker} 
                      className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-lg"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-extrabold text-emerald-400">{res.ticker}</span>
                          {res.supertrendStatus === 'green' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-0.5">
                              <TrendingUp className="w-3 h-3" /> Bullish
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800 flex items-center gap-0.5">
                              <TrendingDown className="w-3 h-3" /> Bearish
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedChartStock(res)}
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-200 border border-slate-700 flex items-center gap-1 text-xs font-medium"
                          >
                            <LineChart className="w-4 h-4 text-emerald-400" />
                            <span>Chart</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] text-slate-400 block">HARGA CLOSE</span>
                          <span className="font-bold text-slate-100">Rp {res.closePrice.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] text-slate-400 block">JARAK MA50</span>
                          <span className="font-bold text-sky-400">+{res.distToMA50Pct}%</span>
                        </div>
                        <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] text-slate-400 block">SKOR AI</span>
                          {res.aiScore !== undefined ? (
                            <span className="font-extrabold text-emerald-400">{res.aiScore}/100</span>
                          ) : (
                            <span className="text-slate-500 italic">-</span>
                          )}
                        </div>
                      </div>

                      {res.tradingPlan ? (
                        <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 flex items-center gap-1">
                              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> Entry Area:
                            </span>
                            <span className="font-bold text-emerald-400">{res.tradingPlan.entry_area}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Stop Loss:
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-rose-400">{res.tradingPlan.stop_loss}</span>
                              {slPct && <span className="text-[9px] font-bold px-1 rounded bg-rose-950 text-rose-400 border border-rose-800">{slPct.text}</span>}
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 flex items-center gap-1">
                              <Target className="w-3.5 h-3.5 text-sky-400" /> Target Price 1:
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sky-400">{res.tradingPlan.target_price_1}</span>
                              {tp1Pct && <span className="text-[9px] font-bold px-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">{tp1Pct.text}</span>}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <button
                        onClick={() =>
                          res.aiMarkdown ? setSelectedStock(res) : handleAnalyzeAI(res)
                        }
                        disabled={res.isAnalyzing || isBatchAnalyzing}
                        className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow flex items-center justify-center gap-2 transition-all disabled:opacity-80"
                      >
                        {res.isAnalyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                            <span className="text-amber-200 animate-pulse font-mono">
                              {res.aiStatusText || 'Menganalisis...'}
                            </span>
                          </>
                        ) : res.aiMarkdown ? (
                          <>
                            <Bot className="w-4 h-4" />
                            <span>Buka Laporan AI Lengkap</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Generate Analisis AI</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ================= MODAL RINGKASAN BATCH AI (SEMENTARA) ================= */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Header Modal */}
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Laporan Ringkasan Batch AI
                </h3>
              </div>
              <button
                onClick={() => setShowBatchModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-header statistik */}
            <div className="bg-slate-950/60 px-5 py-2.5 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>Total Diproses: <strong className="text-slate-200">{batchSummaryList.length} Saham</strong></span>
              <span>
                Berhasil: <strong className="text-emerald-400">{batchSummaryList.filter((b) => b.status === 'success').length}</strong> | 
                Gagal: <strong className="text-rose-400">{batchSummaryList.filter((b) => b.status === 'failed').length}</strong>
              </span>
            </div>

            {/* Daftar Ticker & Model AI */}
            <div className="p-4 overflow-y-auto space-y-2.5 divide-y divide-slate-800/50">
              {batchSummaryList.map((item) => (
                <div key={item.ticker} className="pt-2.5 first:pt-0 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    {item.status === 'success' ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <div>
                      <span className="font-extrabold text-slate-100 text-sm mr-2">{item.ticker}</span>
                      {item.status === 'success' ? (
                        <span className="text-[11px] text-emerald-300 font-medium">
                          {item.action} ({item.score}/100)
                        </span>
                      ) : (
                        <span className="text-[11px] text-rose-400 italic">
                          {item.errorMessage}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badge Nama Model AI (Transien) */}
                  <div className="text-right shrink-0">
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-md font-mono text-[10px]">
                      🤖 {item.modelUsed}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Modal */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex justify-end shrink-0">
              <button
                onClick={() => setShowBatchModal(false)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Selesai & Tutup
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= MODAL AI VIEWER ================= */}
      {selectedStock && selectedStock.aiMarkdown && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[92vh] sm:max-h-[90vh] flex flex-col">
            <div className="px-4 sm:px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base sm:text-lg font-bold text-slate-100">
                  Laporan AI: <span className="text-emerald-400">{selectedStock.ticker}</span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedStock(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedStock.tradingPlan && (() => {
              const slPct = getPctBadge(selectedStock.tradingPlan.stop_loss, selectedStock.tradingPlan.entry_area, selectedStock.closePrice);
              const tp1Pct = getPctBadge(selectedStock.tradingPlan.target_price_1, selectedStock.tradingPlan.entry_area, selectedStock.closePrice);

              return (
                <div className="bg-slate-950/80 border-b border-slate-800 p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs shrink-0">
                  <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">ENTRY AREA</span>
                    <span className="font-bold text-emerald-400">{selectedStock.tradingPlan.entry_area}</span>
                  </div>

                  <div className="bg-slate-900 p-2 rounded-xl border border-slate-800 flex justify-between items-end">
                    <div>
                      <span className="text-slate-400 block text-[10px]">STOP LOSS (SL)</span>
                      <span className="font-bold text-rose-400">{selectedStock.tradingPlan.stop_loss}</span>
                    </div>
                    {slPct && <span className="text-[10px] font-bold text-rose-400 bg-rose-950 px-1 rounded border border-rose-800">{slPct.text}</span>}
                  </div>

                  <div className="bg-slate-900 p-2 rounded-xl border border-slate-800 flex justify-between items-end">
                    <div>
                      <span className="text-slate-400 block text-[10px]">TARGET PRICE 1</span>
                      <span className="font-bold text-sky-400">{selectedStock.tradingPlan.target_price_1}</span>
                    </div>
                    {tp1Pct && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-1 rounded border border-emerald-800">{tp1Pct.text}</span>}
                  </div>

                  <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">R:R RATIO</span>
                    <span className="font-bold text-teal-300">{selectedStock.tradingPlan.rr_ratio}</span>
                  </div>
                </div>
              );
            })()}

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              <AIAnalysisViewer content={selectedStock.aiMarkdown} />
            </div>

            <div className="px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-950 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedStock(null)}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Tutup Laporan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL COMBINED CHART & ANALISIS ================= */}
      {selectedChartStock && (
        <CombinedAnalysisModal
          stock={selectedChartStock}
          onClose={() => setSelectedChartStock(null)}
        />
      )}
    </div>
  );
};