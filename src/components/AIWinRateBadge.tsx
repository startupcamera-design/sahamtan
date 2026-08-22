import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { 
  getAIWinRateStats, 
  evaluateAIPerformance, 
  type WinRateStats, 
  type CategoryWinRate 
} from '../services/aiBacktestService';
import { 
  getTop10ByWinRateHistory, 
  type CandidateWithWinRateScore 
} from '../services/historicalEngine';
import { type TradingPlan } from '../services/aiService';
import { AIAnalysisViewer } from './AIAnalysisViewer';
import { CombinedAnalysisModal } from './CombinedAnalysisModal';
import { 
  Award, RefreshCw, Target, ShieldAlert, Clock, Sparkles, 
  ChevronDown, ChevronUp, ShieldX, Bookmark, X, 
  TrendingUp, AlertTriangle, CheckCircle2, BarChart2, Flame,
  Bot, LineChart, Plus, Wallet, Loader2
} from 'lucide-react';

// Interfaces
export interface AIAnalysisCacheItem {
  id: number;
  ticker: string;
  date: string;
  ai_score: number;
  action_recommendation: string;
  analysis_text: string;
  created_at: string;
  trading_plan: TradingPlan | null;
  result_status: 'PENDING' | 'HIT_TP1' | 'HIT_TP2' | 'HIT_SL' | string;
  max_price_reached: number | null;
  min_price_reached: number | null;
  evaluated_at: string | null;
  last_price?: number; 
}

export interface ScoreRangeStat {
  rangeLabel: string;
  minScore: number;
  maxScore: number;
  total: number;
  winRatePct: number;
  hitTP: number;
  hitSL: number;
  pending: number;
}

// Helper persentase SL & TP yang Aman (Safe Parser)
function getPctBadge(
  targetStr?: string | number | null, 
  entryStr?: string | number | null, 
  fallbackPrice?: number
): { text: string; isPositive: boolean } | null {
  if (!targetStr) return null;

  const parseNum = (val: string | number | null | undefined): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val > 0 ? val : null;
    
    const str = String(val).trim();
    if (!str) return null;

    const matches = str.match(/\d+(?:[.,]\d+)?/g);
    if (!matches || matches.length === 0) return null;

    const nums = matches.map((m) => {
      let clean = m.replace(/,/g, '');
      return parseFloat(clean);
    }).filter(n => !isNaN(n) && n > 0);

    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  };

  const entryPrice = parseNum(entryStr) || fallbackPrice;
  const targetPrice = parseNum(targetStr);

  if (!entryPrice || !targetPrice || entryPrice === 0) return null;

  const pct = ((targetPrice - entryPrice) / entryPrice) * 100;
  const formatted = Math.abs(pct).toFixed(1) + '%';

  return {
    text: pct >= 0 ? `+${formatted}` : `-${formatted}`,
    isPositive: pct >= 0,
  };
}

// Helper Ekstraksi Angka Aman untuk Preset Modal Portofolio
function extractNumberFromStr(val?: string | number | null): number | undefined {
  if (!val) return undefined;
  if (typeof val === 'number') return val;
  const matches = val.match(/\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length === 0) return undefined;
  const clean = matches[0].replace(/,/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? undefined : parsed;
}

export const AIWinRateBadge: React.FC = () => {
  const [stats, setStats] = useState<WinRateStats | null>(null);
  const [scoreRangeStats, setScoreRangeStats] = useState<ScoreRangeStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // State Modal Detail Standar
  const [modalTitle, setModalTitle] = useState<string | null>(null);
  const [modalItems, setModalItems] = useState<AIAnalysisCacheItem[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);

  // State Modal Top 10 Win Rate Engine
  const [top10List, setTop10List] = useState<CandidateWithWinRateScore[]>([]);
  const [showTop10Modal, setShowTop10Modal] = useState(false);
  const [loadingTop10, setLoadingTop10] = useState(false);

  // State Modal AI Viewer & Chart Modal
  const [selectedStockForAi, setSelectedStockForAi] = useState<{ ticker: string; aiMarkdown: string; tradingPlan?: TradingPlan | null; closePrice?: number } | null>(null);
  const [selectedChartStock, setSelectedChartStock] = useState<any | null>(null);

  // Load statistik awal
  const fetchStatsOnly = async () => {
    try {
      const data = await getAIWinRateStats();
      setStats(data);

      const { data: cacheData, error } = await supabase
        .from('ai_analysis_cache')
        .select('ai_score, result_status');

      if (!error && cacheData) {
        const ranges: ScoreRangeStat[] = [
          { rangeLabel: '0 - 10', minScore: 0, maxScore: 10, total: 0, winRatePct: 0, hitTP: 0, hitSL: 0, pending: 0 },
          { rangeLabel: '11 - 20', minScore: 11, maxScore: 20, total: 0, winRatePct: 0, hitTP: 0, hitSL: 0, pending: 0 },
          { rangeLabel: '21 - 30', minScore: 21, maxScore: 30, total: 0, winRatePct: 0, hitTP: 0, hitSL: 0, pending: 0 },
          { rangeLabel: '31 - 40', minScore: 31, maxScore: 40, total: 0, winRatePct: 0, hitTP: 0, hitSL: 0, pending: 0 },
          { rangeLabel: '41 - 50', minScore: 41, maxScore: 50, total: 0, winRatePct: 0, hitTP: 0, hitSL: 0, pending: 0 },
          { rangeLabel: '51 - 60', minScore: 51, maxScore: 60, total: 0, winRatePct: 0, hitTP: 0, hitSL: 0, pending: 0 },
          { rangeLabel: '61 - 70', minScore: 61, maxScore: 70, total: 0, winRatePct: 0, hitTP: 0, hitSL: 0, pending: 0 },
          { rangeLabel: '71 - 80', minScore: 71, maxScore: 80, total: 0, winRatePct: 0, hitTP: 0, hitSL: 0, pending: 0 },
          { rangeLabel: '81 - 90', minScore: 81, maxScore: 90, total: 0, winRatePct: 0, hitTP: 0, hitSL: 0, pending: 0 },
          { rangeLabel: '91 - 100', minScore: 91, maxScore: 100, total: 0, winRatePct: 0, hitTP: 0, hitSL: 0, pending: 0 },
        ];

        cacheData.forEach((row) => {
          const score = row.ai_score || 0;
          const status = row.result_status || 'PENDING';

          const targetRange = ranges.find((r) => score >= r.minScore && score <= r.maxScore);
          if (targetRange) {
            targetRange.total += 1;
            if (status === 'HIT_TP1' || status === 'HIT_TP2') targetRange.hitTP += 1;
            else if (status === 'HIT_SL') targetRange.hitSL += 1;
            else targetRange.pending += 1;
          }
        });

        ranges.forEach((r) => {
          const evaluated = r.hitTP + r.hitSL;
          r.winRatePct = evaluated > 0 ? Math.round((r.hitTP / evaluated) * 100) : 0;
        });

        setScoreRangeStats(ranges);
      }
    } catch (err) {
      console.error('Gagal memuat statistik AI:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFullEvaluation = async () => {
    setIsRefreshing(true);
    try {
      await evaluateAIPerformance();
      await fetchStatsOnly();
    } catch (err) {
      console.error('Gagal mengevaluasi backtest AI:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Panggil Engine Top 10
  const handleTestTop10 = async () => {
    setShowTop10Modal(true);
    setLoadingTop10(true);
    try {
      const { data: latestRow } = await supabase
        .from('ai_analysis_cache')
        .select('date')
        .eq('result_status', 'PENDING')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const targetDate = latestRow?.date || '2026-08-19';
      const results = await getTop10ByWinRateHistory(targetDate);
      setTop10List(results);
    } catch (err) {
      console.error('Gagal memproses Top 10 Win Rate:', err);
      setTop10List([]);
    } finally {
      setLoadingTop10(false);
    }
  };

  useEffect(() => {
    fetchStatsOnly();
  }, []);

  const getActionBadge = (action: string) => {
    const act = (action || '').toUpperCase();
    if (act.includes('STRONG BUY')) return { bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', label: 'STRONG BUY' };
    if (act.includes('BUY ON SUPPORT')) return { bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400', label: 'BUY ON SUPPORT' };
    if (act.includes('WATCHLIST')) return { bg: 'bg-purple-500/10 border-purple-500/30 text-purple-400', label: 'WATCHLIST' };
    if (act.includes('WAIT')) return { bg: 'bg-blue-500/10 border-blue-500/30 text-blue-400', label: 'WAIT FOR CONFIRMATION' };
    return { bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400', label: 'AVOID / HIGH RISK' };
  };

  const getScoreRangeColor = (winRate: number, total: number) => {
    if (total === 0) return 'border-slate-800 text-slate-500 bg-slate-950/40';
    if (winRate >= 70) return 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10';
    if (winRate >= 50) return 'border-amber-500/40 text-amber-400 bg-amber-500/10';
    return 'border-rose-500/40 text-rose-400 bg-rose-500/10';
  };

  const loadModalData = async (
    filterTitle: string, 
    filterQuery: (builder: any) => any
  ) => {
    setModalTitle(filterTitle);
    setLoadingModal(true);
    try {
      let query = supabase.from('ai_analysis_cache').select('*');
      query = filterQuery(query);

      const { data: cacheData, error: cacheError } = await query;

      if (cacheError || !cacheData || cacheData.length === 0) {
        setModalItems([]);
        return;
      }

      const pendingTickers = Array.from(
        new Set(
          cacheData
            .filter((item) => (item.result_status || 'PENDING') === 'PENDING')
            .map((item) => item.ticker)
        )
      );

      const latestPricesMap = new Map<string, number>();

      if (pendingTickers.length > 0) {
        const { data: priceData, error: priceError } = await supabase
          .from('daily_stock_prices')
          .select('ticker, close, date')
          .in('ticker', pendingTickers)
          .order('date', { ascending: false });

        if (!priceError && priceData) {
          priceData.forEach((row) => {
            if (!latestPricesMap.has(row.ticker)) {
              latestPricesMap.set(row.ticker, Number(row.close));
            }
          });
        }
      }

      const formattedItems: AIAnalysisCacheItem[] = cacheData.map((row) => {
        let parsedPlan = row.trading_plan;
        if (typeof row.trading_plan === 'string') {
          try {
            parsedPlan = JSON.parse(row.trading_plan);
          } catch {
            parsedPlan = null;
          }
        }

        const isPending = (row.result_status || 'PENDING') === 'PENDING';
        const fetchedPrice = latestPricesMap.get(row.ticker);

        return {
          id: row.id,
          ticker: row.ticker,
          date: row.date,
          ai_score: row.ai_score,
          action_recommendation: row.action_recommendation,
          analysis_text: row.analysis_text,
          created_at: row.created_at,
          trading_plan: parsedPlan,
          result_status: row.result_status || 'PENDING',
          max_price_reached: row.max_price_reached,
          min_price_reached: row.min_price_reached,
          evaluated_at: row.evaluated_at,
          last_price: isPending ? fetchedPrice : (row.max_price_reached || undefined)
        };
      });

      const statusOrderPriority: Record<string, number> = {
        'PENDING': 1,
        'HIT_TP2': 2,
        'HIT_TP1': 3,
        'HIT_SL': 4,
      };

      formattedItems.sort((a, b) => {
        const priorityA = statusOrderPriority[a.result_status] || 99;
        const priorityB = statusOrderPriority[b.result_status] || 99;

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      setModalItems(formattedItems);
    } catch (error) {
      console.error('Gagal mengambil detail modal:', error);
      setModalItems([]);
    } finally {
      setLoadingModal(false);
    }
  };

  const handleOpenCategoryModal = (actionCategory: string) => {
    const cleanCategory = actionCategory.trim();
    loadModalData(`Kategori: ${cleanCategory}`, (q) => 
      q.ilike('action_recommendation', `%${cleanCategory}%`)
    );
  };

  const handleOpenScoreRangeModal = (range: ScoreRangeStat) => {
    loadModalData(`Rentang AI Score: ${range.rangeLabel}`, (q) => 
      q.gte('ai_score', range.minScore).lte('ai_score', range.maxScore)
    );
  };

  if (loading) {
    return (
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl backdrop-blur-md animate-pulse my-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-slate-800 rounded-xl" />
            <div className="space-y-2">
              <div className="w-28 h-3 bg-slate-800 rounded" />
              <div className="w-16 h-6 bg-slate-800 rounded" />
            </div>
          </div>
          <div className="w-24 h-8 bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!stats || stats.totalAnalyzed === 0) {
    return (
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl backdrop-blur-md my-4 flex items-center justify-between">
        <div className="flex items-center space-x-3 text-slate-400 text-xs">
          <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
          <span>Belum ada riwayat rekomendasi AI yang dievaluasi.</span>
        </div>
        <button
          onClick={handleFullEvaluation}
          disabled={isRefreshing}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Evaluasi AI</span>
        </button>
      </div>
    );
  }

  const hitTPTotal = (stats.hitTP1 || 0) + (stats.hitTP2 || 0);

  return (
    <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 text-white shadow-xl backdrop-blur-md my-4 space-y-3 transition-all">
      
      {/* HEADER BARIS UTAMA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl shrink-0 shadow-inner">
            <Award className="w-6 h-6" />
          </div>
          
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>Akurasi Sinyal Beli & Watchlist AI</span>
              <span className="text-[10px] text-slate-500 font-normal">({stats.totalAnalyzed} Saham)</span>
            </div>

            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight">
                {stats.winRatePct}%
              </span>
              <span className="text-xs font-semibold text-slate-300">
                Win Rate Actionable
              </span>
            </div>
          </div>
        </div>

        {/* Sisi Kanan: Stat Ringkas & Tombol Top 10 Win Rate */}
        <div className="flex items-center justify-between sm:justify-end space-x-2 sm:space-x-3 text-xs border-t sm:border-t-0 border-slate-800/80 pt-3 sm:pt-0">
          
          <div className="flex items-center space-x-1.5 bg-slate-950/60 border border-slate-800 px-2.5 py-1.5 rounded-xl">
            <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div>
              <span className="block text-emerald-400 font-extrabold leading-none">{hitTPTotal}</span>
              <span className="text-[10px] text-slate-400">TP Hit</span>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-950/60 border border-slate-800 px-2.5 py-1.5 rounded-xl">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <div>
              <span className="block text-rose-400 font-extrabold leading-none">{stats.hitSL || 0}</span>
              <span className="text-[10px] text-slate-400">SL Hit</span>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-950/60 border border-slate-800 px-2.5 py-1.5 rounded-xl">
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div>
              <span className="block text-amber-400 font-extrabold leading-none">{stats.pending || 0}</span>
              <span className="text-[10px] text-slate-400">Aktif</span>
            </div>
          </div>

          {/* TOMBOL TOP 10 WIN RATE */}
          <button
            onClick={handleTestTop10}
            className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 transition active:scale-95 cursor-pointer shrink-0 border border-emerald-400/30"
            title="Saring 100+ Saham PENDING Hari Ini Menjadi Top 10 Berdasarkan Win Rate Historis"
          >
            <Flame className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span>Top 10 Win Rate</span>
          </button>

          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl flex items-center gap-1 font-semibold transition active:scale-95 cursor-pointer shrink-0"
          >
            <span>Detail</span>
            {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleFullEvaluation}
            disabled={isRefreshing}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

        </div>
      </div>

      {/* EXPANDABLE SECTION */}
      {showBreakdown && (
        <div className="pt-3 border-t border-slate-800/80 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {stats.breakdown && stats.breakdown.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center justify-between">
                <span>📊 PERBANDINGAN AKURASI PER JENIS REKOMENDASI</span>
                <span className="text-[10px] text-slate-500 font-normal">*Klik kartu untuk daftar saham</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {stats.breakdown.map((item: CategoryWinRate, idx: number) => {
                  const badge = getActionBadge(item.action);
                  const isAvoid = item.action.toUpperCase().includes('AVOID');
                  const totalTP = (item.hitTP1 || 0) + (item.hitTP2 || 0);

                  return (
                    <div
                      key={idx}
                      onClick={() => handleOpenCategoryModal(item.action)}
                      className={`p-2.5 rounded-xl border cursor-pointer hover:border-indigo-500/50 hover:bg-slate-900 transition-all ${
                        isAvoid ? 'bg-slate-950/40 border-slate-800/60 opacity-80' : 'bg-slate-950/80 border-slate-800'
                      } space-y-1.5`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badge.bg}`}>
                          {badge.label}
                        </span>
                        <span className="text-[10px] text-slate-400">{item.totalAnalyzed} Saham</span>
                      </div>

                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-400">Win Rate:</span>
                        <span className={`text-base font-black ${isAvoid ? 'text-slate-400' : 'text-emerald-400'}`}>
                          {item.winRatePct}%
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/60 pt-1">
                        {isAvoid ? (
                          <div className="flex items-center gap-1 text-rose-400/90 text-[10px]">
                            <ShieldX className="w-3 h-3 shrink-0" />
                            <span>Filter Risiko Berhasil</span>
                          </div>
                        ) : (
                          <>
                            <span className="text-emerald-400">TP: {totalTP}</span>
                            <span className="text-rose-400">SL: {item.hitSL || 0}</span>
                            <span className="text-amber-400">Aktif: {item.pending || 0}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>AKURASI WIN RATE BERDASARKAN RENTANG AI SCORE (0-100)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-normal">*Geser menyamping →</span>
            </div>

            <div className="flex items-center space-x-2 overflow-x-auto pb-2 pt-1 custom-scrollbar">
              {scoreRangeStats.map((range, idx) => {
                const colorClass = getScoreRangeColor(range.winRatePct, range.total);

                return (
                  <button
                    key={idx}
                    onClick={() => range.total > 0 && handleOpenScoreRangeModal(range)}
                    disabled={range.total === 0}
                    className={`shrink-0 flex items-center space-x-2.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800/80 ${colorClass}`}
                  >
                    <span className="text-[11px] text-slate-300 font-bold bg-slate-900/80 border border-slate-800 px-1.5 py-0.5 rounded-md">
                      {range.rangeLabel}
                    </span>

                    <div className="text-left leading-tight">
                      <span className="block font-black text-sm">
                        {range.total > 0 ? `${range.winRatePct}%` : 'N/A'}
                      </span>
                      <span className="block text-[9px] text-slate-400 font-normal">
                        {range.total} Saham
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL LIST DETAIL SAHAM STANDAR */}
      {modalTitle && (
        <AIStockDetailModal 
          title={modalTitle} 
          items={modalItems} 
          loading={loadingModal} 
          onClose={() => setModalTitle(null)} 
        />
      )}

      {/* MODAL HASIL TOP 10 WIN RATE LENGKAP ANALISIS AI */}
      {showTop10Modal && (
        <Top10WinRateModal 
          items={top10List} 
          loading={loadingTop10} 
          onClose={() => setShowTop10Modal(false)}
          onOpenAiViewer={(ticker, aiMarkdown, tradingPlan) => {
            setSelectedStockForAi({ ticker, aiMarkdown, tradingPlan });
          }}
          onOpenChart={(stock) => {
            setSelectedChartStock(stock);
          }}
        />
      )}

      {/* MODAL LAPORAN AI MARKDOWN VIEWER */}
      {selectedStockForAi &&
        createPortal(
          <div className="fixed inset-0 z-[999999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
            <div 
              className="absolute inset-0" 
              onClick={() => setSelectedStockForAi(null)} 
            />

            <div className="relative z-10 bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col text-slate-200">
              <div className="px-4 sm:px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950 shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base sm:text-lg font-bold text-slate-100">
                    Laporan AI: <span className="text-emerald-400">{selectedStockForAi.ticker}</span>
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedStockForAi(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {selectedStockForAi.tradingPlan && (() => {
                const plan = selectedStockForAi.tradingPlan;
                const slPct = getPctBadge(plan.stop_loss, plan.entry_area);
                const tp1Pct = getPctBadge(plan.target_price_1, plan.entry_area);

                return (
                  <div className="bg-slate-950/80 border-b border-slate-800 p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs shrink-0">
                    <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">ENTRY AREA</span>
                      <span className="font-bold text-emerald-400">{plan.entry_area}</span>
                    </div>

                    <div className="bg-slate-900 p-2 rounded-xl border border-slate-800 flex justify-between items-end">
                      <div>
                        <span className="text-slate-400 block text-[10px]">STOP LOSS (SL)</span>
                        <span className="font-bold text-rose-400">{plan.stop_loss}</span>
                      </div>
                      {slPct && <span className="text-[10px] font-bold text-rose-400 bg-rose-950 px-1 rounded border border-rose-800">{slPct.text}</span>}
                    </div>

                    <div className="bg-slate-900 p-2 rounded-xl border border-slate-800 flex justify-between items-end">
                      <div>
                        <span className="text-slate-400 block text-[10px]">TARGET PRICE 1</span>
                        <span className="font-bold text-sky-400">{plan.target_price_1}</span>
                      </div>
                      {tp1Pct && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-1 rounded border border-emerald-800">{tp1Pct.text}</span>}
                    </div>

                    <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">R:R RATIO</span>
                      <span className="font-bold text-teal-300">{plan.rr_ratio}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="p-4 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar flex-1">
                <AIAnalysisViewer content={selectedStockForAi.aiMarkdown} />
              </div>

              <div className="px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-950 flex justify-end shrink-0">
                <button
                  onClick={() => setSelectedStockForAi(null)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Tutup Laporan
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* MODAL COMBINED CHART */}
      {selectedChartStock && (
        <CombinedAnalysisModal
          stock={selectedChartStock}
          onClose={() => setSelectedChartStock(null)}
        />
      )}

    </div>
  );
};

// COMPONENT MODAL ADD TO PORTFOLIO (UNIVERSAL)
interface AddToPortfolioModalProps {
  ticker: string;
  defaultPrice?: number;
  defaultSL?: number;
  defaultTP1?: number;
  defaultTP2?: number;
  onClose: () => void;
  onSuccess?: () => void;
}

const AddToPortfolioModal: React.FC<AddToPortfolioModalProps> = ({
  ticker,
  defaultPrice = 0,
  defaultSL = 0,
  defaultTP1 = 0,
  defaultTP2 = 0,
  onClose,
  onSuccess,
}) => {
  const [buyPrice, setBuyPrice] = useState<number | string>(defaultPrice || '');
  const [lots, setLots] = useState<number | string>(1);
  const [stopLoss, setStopLoss] = useState<number | string>(defaultSL || '');
  const [tp1, setTp1] = useState<number | string>(defaultTP1 || '');
  const [tp2, setTp2] = useState<number | string>(defaultTP2 || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyPrice || !lots) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('user_portfolio').insert([
        {
          ticker: ticker.toUpperCase().trim(),
          buy_price: Number(buyPrice),
          lots: Number(lots),
          stop_loss: stopLoss ? Number(stopLoss) : null,
          target_price_1: tp1 ? Number(tp1) : null,
          target_price_2: tp2 ? Number(tp2) : null,
        },
      ]);

      if (error) throw error;

      alert(`✅ ${ticker} berhasil disimpan ke Portofolio!`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      alert(`⚠️ Gagal menyimpan ke portofolio: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[999999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-slate-200">
        
        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base text-white">
              Tambah Posisi: <span className="text-emerald-400">{ticker}</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Harga Beli (Avg) <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                placeholder="misal: 52"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Jumlah Lot <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                value={lots}
                onChange={(e) => setLots(e.target.value)}
                placeholder="misal: 10"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
          </div>

          <hr className="border-slate-800" />

          {/* Target Harga Preset dari AI Plan (Bisa disesuaikan) */}
          <div className="space-y-2.5">
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Target Plan (Tersimpan di DB)
            </span>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-rose-400 font-bold mb-1">Stop Loss (SL)</label>
                <input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="SL"
                  className="w-full bg-slate-950 border border-rose-950/60 rounded-xl px-2.5 py-1.5 text-rose-300 font-bold text-xs focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-[10px] text-sky-400 font-bold mb-1">Target 1 (TP1)</label>
                <input
                  type="number"
                  value={tp1}
                  onChange={(e) => setTp1(e.target.value)}
                  placeholder="TP1"
                  className="w-full bg-slate-950 border border-sky-950/60 rounded-xl px-2.5 py-1.5 text-sky-300 font-bold text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[10px] text-teal-400 font-bold mb-1">Target 2 (TP2)</label>
                <input
                  type="number"
                  value={tp2}
                  onChange={(e) => setTp2(e.target.value)}
                  placeholder="TP2"
                  className="w-full bg-slate-950 border border-teal-950/60 rounded-xl px-2.5 py-1.5 text-teal-300 font-bold text-xs focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-950/50 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Simpan ke Portofolio</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// COMPONENT MODAL DEDIKASI TOP 10 WIN RATE DENGAN INTEGRASI ANALISIS AI LENGKAP (5 PILAR)
const Top10WinRateModal: React.FC<{
  items: CandidateWithWinRateScore[];
  loading: boolean;
  onClose: () => void;
  onOpenAiViewer: (ticker: string, aiMarkdown: string, tradingPlan?: TradingPlan | null) => void;
  onOpenChart: (stock: any) => void;
}> = ({ items, loading, onClose, onOpenAiViewer, onOpenChart }) => {
  const [portfolioModalStock, setPortfolioModalStock] = useState<{
    ticker: string;
    defaultPrice?: number;
    defaultSL?: number;
    defaultTP1?: number;
    defaultTP2?: number;
  } | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const modalContent = (
    <div className="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-200">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center space-x-2">
            <Flame className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base text-white">
              Saringan AI Win Rate: <span className="text-emerald-400">Top 10 Probability TP (Historis 5 Pilar)</span>
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-3.5 flex-1 custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
              <p className="text-xs">Mengkalkulasi matriks Win Rate 5 pilar historis & menyaring 100+ saham...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Tidak ada saham berstatus PENDING ditemukan untuk tanggal bursa terbaru.
            </div>
          ) : (
            items.map((item, index) => {
              let plan: TradingPlan | null = null;
              if (item.trading_plan) {
                plan = typeof item.trading_plan === 'string' 
                  ? JSON.parse(item.trading_plan) 
                  : item.trading_plan;
              }

              const slPct = getPctBadge(plan?.stop_loss, plan?.entry_area);
              const tp1Pct = getPctBadge(plan?.target_price_1, plan?.entry_area);

              return (
                <div 
                  key={item.id} 
                  className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl space-y-3 hover:border-slate-700 transition"
                >
                  {/* Baris Atas Header Kartu */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black text-xs flex items-center justify-center">
                        #{index + 1}
                      </span>
                      <strong className="text-lg text-white font-extrabold">{item.ticker}</strong>
                      <span className="text-[11px] text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                        {item.date}
                      </span>
                      <span className="text-[11px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                        Raw AI Score: {item.ai_score}
                      </span>
                      {item.action_recommendation && (
                        <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                          {item.action_recommendation}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* TOMBOL TAMBAH KE PORTOFOLIO (1-KLIK) */}
                      <button
                        onClick={() => {
                          setPortfolioModalStock({
                            ticker: item.ticker,
                            defaultPrice: extractNumberFromStr(plan?.entry_area),
                            defaultSL: extractNumberFromStr(plan?.stop_loss),
                            defaultTP1: extractNumberFromStr(plan?.target_price_1),
                            defaultTP2: extractNumberFromStr(plan?.target_price_2),
                          });
                        }}
                        title="Tambah ke Portofolio"
                        className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-indigo-400" />
                        <span>+ Porto</span>
                      </button>

                      <button
                        onClick={() => onOpenChart({
                          ticker: item.ticker,
                          lastDate: item.date,
                          closePrice: 0,
                          ma50: 0,
                          distToMA50Pct: 0,
                          volume: 0,
                          avgVolume20: 0,
                          isPullbackHealthy: true,
                          supertrendStatus: item.supertrend_status,
                          aiScore: item.ai_score,
                          aiAction: item.action_recommendation,
                          tradingPlan: plan,
                          aiMarkdown: item.analysis_text
                        })}
                        title="Lihat Chart & Analisis"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                      >
                        <LineChart className="w-4 h-4" />
                      </button>

                      <div className="text-right pl-2 border-l border-slate-800">
                        <span className="text-[10px] text-slate-400 block">TP Win Rate Prob</span>
                        <span className="text-lg font-black text-emerald-400">
                          {item.historicalProbabilityScore}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Grid Ringkasan Trading Plan (Jika Ada Data Analisis AI) */}
                  {plan && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Entry Area</span>
                        <strong className="text-emerald-400">{plan.entry_area || '-'}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Stop Loss (SL)</span>
                        <div className="flex items-center gap-1">
                          <strong className="text-rose-400">{plan.stop_loss || '-'}</strong>
                          {slPct && <span className="text-[9px] font-bold text-rose-400 bg-rose-950 px-1 rounded border border-rose-800">{slPct.text}</span>}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Target Price 1 (TP1)</span>
                        <div className="flex items-center gap-1">
                          <strong className="text-sky-400">{plan.target_price_1 || '-'}</strong>
                          {tp1Pct && <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950 px-1 rounded border border-emerald-800">{tp1Pct.text}</span>}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Risk to Reward</span>
                        <strong className="text-amber-400">{plan.rr_ratio || '-'}</strong>
                      </div>
                    </div>
                  )}

                  {/* Breakdown Win Rate Matriks (5 Pilar) */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] pt-1 text-slate-400">
                    <div>
                      <span className="block text-slate-500">WR Score ({item.ai_score}):</span>
                      <strong className="text-slate-200">{item.breakdownWR.scoreWR}%</strong>
                    </div>

                    <div>
                      <span className="block text-slate-500">WR SuperTrend ({item.supertrend_status}):</span>
                      <strong className={item.supertrend_status === 'green' ? 'text-emerald-400' : 'text-rose-400'}>
                        {item.breakdownWR.supertrendWR}%
                      </strong>
                    </div>

                    <div>
                      <span className="block text-slate-500">WR Action ({item.action_recommendation}):</span>
                      <strong className="text-slate-200">{item.breakdownWR.actionWR}%</strong>
                    </div>

                    {/* PILAR BARU: Volume Ratio & Tier */}
                    <div>
                      <span className="block text-slate-500">
                        WR Vol ({item.volume_ratio ? `${item.volume_ratio}x` : 'Norm'}):
                      </span>
                      <strong className="text-amber-400">
                        {item.breakdownWR.volumeWR ?? 50}%
                      </strong>
                    </div>

                    <div>
                      <span className="block text-slate-500">WR Price Tier:</span>
                      <strong className="text-slate-200">{item.breakdownWR.pennyWR}%</strong>
                    </div>
                  </div>

                  {/* Tombol Lihat Laporan AI Lengkap */}
                  {item.analysis_text && (
                    <div className="pt-2 border-t border-slate-800/80 flex justify-end">
                      <button
                        onClick={() => onOpenAiViewer(item.ticker, item.analysis_text, plan)}
                        className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Buka Analisis AI Lengkap</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* MODAL ADD TO PORTFOLIO */}
      {portfolioModalStock && (
        <AddToPortfolioModal
          ticker={portfolioModalStock.ticker}
          defaultPrice={portfolioModalStock.defaultPrice}
          defaultSL={portfolioModalStock.defaultSL}
          defaultTP1={portfolioModalStock.defaultTP1}
          defaultTP2={portfolioModalStock.defaultTP2}
          onClose={() => setPortfolioModalStock(null)}
        />
      )}

    </div>
  );

  return createPortal(modalContent, document.body);
};

// COMPONENT MODAL DETAIL SAHAM STANDAR PER KATEGORI/SKOR
interface ModalProps {
  title: string;
  items: AIAnalysisCacheItem[];
  loading: boolean;
  onClose: () => void;
}

const AIStockDetailModal: React.FC<ModalProps> = ({ title, items, loading, onClose }) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const modalContent = (
    <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-slate-200">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2">
            <Bookmark className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base text-white">
              Daftar Rekomendasi: <span className="text-indigo-400 uppercase">{title}</span>
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-400" />
              <p className="text-xs">Memuat detail saham & mencari harga terbaru...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Tidak ada saham ditemukan untuk filter ini.
            </div>
          ) : (
            items.map((item) => (
              <StockDetailCard key={item.id} item={item} />
            ))
          )}
        </div>

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// COMPONENT KARTU INDIVIDUAL SAHAM
const StockDetailCard: React.FC<{ item: AIAnalysisCacheItem }> = ({ item }) => {
  const plan = item.trading_plan;
  const isPending = item.result_status === 'PENDING';

  const parseNum = (val?: string | number | null) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const clean = val.replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
  };

  const getEntryPriceAvg = (entryStr?: string) => {
    if (!entryStr) return 0;
    const parts = entryStr.split(/[-–]/).map(p => parseNum(p)).filter(n => n > 0);
    if (parts.length === 0) return 0;
    if (parts.length === 1) return parts[0];
    return (parts[0] + parts[1]) / 2;
  };

  const slPrice = parseNum(plan?.stop_loss);
  const tp1Price = parseNum(plan?.target_price_1);
  const entryAvgPrice = getEntryPriceAvg(plan?.entry_area);
  
  const currentPrice = item.last_price || item.max_price_reached || entryAvgPrice;

  const dynamicRR = useMemo(() => {
    if (!currentPrice || !slPrice || !tp1Price || currentPrice <= slPrice) {
      return plan?.rr_ratio || 'N/A';
    }
    const risk = currentPrice - slPrice;
    const reward = tp1Price - currentPrice;
    if (risk <= 0 || reward <= 0) return plan?.rr_ratio || 'N/A';

    const ratio = (reward / risk).toFixed(2);
    return `1 : ${ratio}`;
  }, [currentPrice, slPrice, tp1Price, plan?.rr_ratio]);

  return (
    <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 hover:border-slate-700 transition space-y-3">
      
      {/* Baris Atas */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
        <div className="flex items-center space-x-2">
          <span className="text-lg font-black text-white tracking-wider">{item.ticker}</span>
          <span className="text-[11px] text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md">
            {item.date}
          </span>
          <span className="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
            Score: {item.ai_score}
          </span>
        </div>

        <ResultStatusBadge status={item.result_status} />
      </div>

      {/* Grid Informasi Trading Plan & Harga */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
        
        <div className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg">
          <span className="block text-[10px] text-slate-400">Harga Terakhir</span>
          <span className="font-extrabold text-white text-sm">
            {currentPrice ? `Rp ${currentPrice.toLocaleString('id-ID')}` : '-'}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg">
          <span className="block text-[10px] text-slate-400">Area Entry</span>
          <span className="font-semibold text-slate-200">{plan?.entry_area || '-'}</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg">
          <span className="block text-[10px] text-slate-400">Stop Loss</span>
          <span className="font-bold text-rose-400">{plan?.stop_loss || '-'}</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg">
          <span className="block text-[10px] text-slate-400">Target 1 (TP1)</span>
          <span className="font-bold text-emerald-400">{plan?.target_price_1 || '-'}</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg">
          <span className="block text-[10px] text-slate-400">Target 2 (TP2)</span>
          <span className="font-bold text-teal-400">{plan?.target_price_2 || '-'}</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-2 rounded-lg">
          <span className="block text-[10px] text-slate-400">
            {isPending ? 'R:R Terkalkulasi' : 'R:R Awal'}
          </span>
          <span className="font-extrabold text-amber-400">
            {isPending ? dynamicRR : (plan?.rr_ratio || '-')}
          </span>
        </div>

      </div>

      {/* Keterangan Tambahan */}
      <div className="text-[11px] bg-slate-900/40 p-2 rounded-lg border border-slate-800/40 text-slate-300">
        {isPending ? (
          <div className="flex items-center space-x-1.5 text-amber-400/90">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>
              <strong>Status Belum Hit (PENDING):</strong> High Tertinggi: <strong>{item.max_price_reached ? `Rp ${item.max_price_reached}` : 'Belum Terdeteksi'}</strong> | Low Terendah: <strong>{item.min_price_reached ? `Rp ${item.min_price_reached}` : 'Belum Terdeteksi'}</strong>
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              Evaluasi Selesai ({item.result_status}) | High Tertinggi: <strong className="text-emerald-400">Rp {item.max_price_reached || '-'}</strong> | Low Terendah: <strong className="text-rose-400">Rp {item.min_price_reached || '-'}</strong>
            </span>
          </div>
        )}
      </div>

    </div>
  );
};

// HELPER STATUS RESULT BADGE
const ResultStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'HIT_TP2':
      return (
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-teal-500/20 text-teal-300 border border-teal-500/40 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> HIT TP2 (MAX)
        </span>
      );
    case 'HIT_TP1':
      return (
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
          <Target className="w-3 h-3" /> HIT TP1
        </span>
      );
    case 'HIT_SL':
      return (
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> HIT SL
        </span>
      );
    default:
      return (
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
          <Clock className="w-3 h-3" /> AKTIF / PENDING
        </span>
      );
  }
};