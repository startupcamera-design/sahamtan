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
  Award, RefreshCw, Target, ShieldAlert, Clock, Sparkles, 
  ChevronDown, ChevronUp, ShieldX, Bookmark, X, 
  TrendingUp, AlertTriangle, CheckCircle2, BarChart2 
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
  trading_plan: {
    status?: string;
    rr_ratio?: string;
    stop_loss?: string | number;
    entry_area?: string;
    target_price_1?: string | number;
    target_price_2?: string | number;
  } | null;
  result_status: 'PENDING' | 'HIT_TP1' | 'HIT_TP2' | 'HIT_SL' | string;
  max_price_reached: number | null;
  min_price_reached: number | null;
  evaluated_at: string | null;
  last_price?: number; 
}

export interface ScoreRangeStat {
  rangeLabel: string; // Misal: "81-90"
  minScore: number;   // 81
  maxScore: number;   // 90
  total: number;
  winRatePct: number;
  hitTP: number;
  hitSL: number;
  pending: number;
}

export const AIWinRateBadge: React.FC = () => {
  const [stats, setStats] = useState<WinRateStats | null>(null);
  const [scoreRangeStats, setScoreRangeStats] = useState<ScoreRangeStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // State untuk Modal Detail
  const [modalTitle, setModalTitle] = useState<string | null>(null);
  const [modalItems, setModalItems] = useState<AIAnalysisCacheItem[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);

  // Load awal & kalkulasi statistik AI Score Range (0-100)
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

  useEffect(() => {
    fetchStatsOnly();
  }, []);

  // Helper Warna Badge Kategori
  const getActionBadge = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('STRONG BUY')) return { bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', label: 'STRONG BUY' };
    if (act.includes('BUY ON SUPPORT')) return { bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400', label: 'BUY ON SUPPORT' };
    if (act.includes('WATCHLIST')) return { bg: 'bg-purple-500/10 border-purple-500/30 text-purple-400', label: 'WATCHLIST' };
    if (act.includes('WAIT')) return { bg: 'bg-blue-500/10 border-blue-500/30 text-blue-400', label: 'WAIT FOR CONFIRMATION' };
    return { bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400', label: 'AVOID / HIGH RISK' };
  };

  // Helper Warna Rentang Skor
  const getScoreRangeColor = (winRate: number, total: number) => {
    if (total === 0) return 'border-slate-800 text-slate-500 bg-slate-950/40';
    if (winRate >= 70) return 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10';
    if (winRate >= 50) return 'border-amber-500/40 text-amber-400 bg-amber-500/10';
    return 'border-rose-500/40 text-rose-400 bg-rose-500/10';
  };

  // Loader Data Modal dengan Urutan Status: PENDING -> HIT_TP2 -> HIT_TP1 -> HIT_SL
  const loadModalData = async (
    filterTitle: string, 
    filterQuery: (builder: any) => any
  ) => {
    setModalTitle(filterTitle);
    setLoadingModal(true);
    try {
      let query = supabase
        .from('ai_analysis_cache')
        .select('*');

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

      // PENGURUTAN KUSTOM: PENDING -> HIT_TP2 -> HIT_TP1 -> HIT_SL (Lalu berdasarkan tanggal terbaru)
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

        // Urutkan tanggal menurun jika statusnya sama
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
        
        {/* Sisi Kiri: Win Rate Utama */}
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

        {/* Sisi Kanan: Stat Ringkas */}
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

          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl flex items-center gap-1 font-semibold transition active:scale-95 cursor-pointer shrink-0"
            title="Lihat Perbedaan Win Rate per Tipe Rekomendasi & AI Score"
          >
            <span>Detail</span>
            {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleFullEvaluation}
            disabled={isRefreshing}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition cursor-pointer disabled:opacity-50 shrink-0"
            title="Jalankan Evaluasi Backtest Ulang"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

        </div>
      </div>

      {/* EXPANDABLE SECTION */}
      {showBreakdown && (
        <div className="pt-3 border-t border-slate-800/80 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          
          {/* SECTION 1: PERBANDINGAN PER JENIS REKOMENDASI */}
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

          {/* SECTION 2: RENTANG SKOR AI */}
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
                    title={`Klik untuk lihat ${range.total} saham dengan skor ${range.rangeLabel}`}
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

      {/* MODAL LIST DETAIL SAHAM */}
      {modalTitle && (
        <AIStockDetailModal 
          title={modalTitle} 
          items={modalItems} 
          loading={loadingModal} 
          onClose={() => setModalTitle(null)} 
        />
      )}

    </div>
  );
};

// COMPONENT MODAL DETAIL SAHAM PER KATEGORI/SKOR
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

// COMPONENT KARTU INDIVIDUAL SAHAM DENGAN KALKULASI R:R
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

      {/* Keterangan Tambahan Menurut Status */}
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