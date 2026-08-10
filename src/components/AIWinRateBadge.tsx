import React, { useEffect, useState } from 'react';
import { getAIWinRateStats, evaluateAIPerformance, type WinRateStats, type CategoryWinRate } from '../services/aiBacktestService';
import { Award, RefreshCw, Target, ShieldAlert, Clock, Sparkles, ChevronDown, ChevronUp, ShieldX } from 'lucide-react';

export const AIWinRateBadge: React.FC = () => {
  const [stats, setStats] = useState<WinRateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Load awal hanya membaca data agregat (cepat)
  const fetchStatsOnly = async () => {
    try {
      const data = await getAIWinRateStats();
      setStats(data);
    } catch (err) {
      console.error('Gagal memuat statistik AI:', err);
    } finally {
      setLoading(false);
    }
  };

  // Jalankan evaluasi ulang saat user mengeklik tombol Refresh
  const handleFullEvaluation = async () => {
    setIsRefreshing(true);
    try {
      await evaluateAIPerformance(); // Run backtest evaluator
      const data = await getAIWinRateStats();
      setStats(data);
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
    if (act.includes('WAIT')) return { bg: 'bg-blue-500/10 border-blue-500/30 text-blue-400', label: 'WAIT FOR CONFIRMATION' };
    return { bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400', label: 'AVOID / HIGH RISK' };
  };

  // Skeleton Loader
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
        
        {/* Sisi Kiri: Win Rate Utama (Khusus Rekomendasi Beli) */}
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl shrink-0 shadow-inner">
            <Award className="w-6 h-6" />
          </div>
          
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>Akurasi Sinyal Beli AI</span>
              <span className="text-[10px] text-slate-500 font-normal">({stats.totalAnalyzed} Saham Beli)</span>
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

        {/* Sisi Kanan: Stat Ringkas, Toggle Detail & Refresh Button */}
        <div className="flex items-center justify-between sm:justify-end space-x-2 sm:space-x-3 text-xs border-t sm:border-t-0 border-slate-800/80 pt-3 sm:pt-0">
          
          {/* Hit TP */}
          <div className="flex items-center space-x-1.5 bg-slate-950/60 border border-slate-800 px-2.5 py-1.5 rounded-xl">
            <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div>
              <span className="block text-emerald-400 font-extrabold leading-none">{hitTPTotal}</span>
              <span className="text-[10px] text-slate-400">TP Hit</span>
            </div>
          </div>

          {/* Hit SL */}
          <div className="flex items-center space-x-1.5 bg-slate-950/60 border border-slate-800 px-2.5 py-1.5 rounded-xl">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <div>
              <span className="block text-rose-400 font-extrabold leading-none">{stats.hitSL || 0}</span>
              <span className="text-[10px] text-slate-400">SL Hit</span>
            </div>
          </div>

          {/* Pending / Active */}
          <div className="flex items-center space-x-1.5 bg-slate-950/60 border border-slate-800 px-2.5 py-1.5 rounded-xl">
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div>
              <span className="block text-amber-400 font-extrabold leading-none">{stats.pending || 0}</span>
              <span className="text-[10px] text-slate-400">Aktif</span>
            </div>
          </div>

          {/* Tombol Toggle Detail Breakdown */}
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl flex items-center gap-1 font-semibold transition active:scale-95 cursor-pointer shrink-0"
            title="Lihat Perbedaan Win Rate per Tipe Rekomendasi"
          >
            <span>Detail Jenis</span>
            {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Tombol Refresh Evaluasi */}
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

      {/* SECTION BREAKDOWN PER JENIS REKOMENDASI (POP-DOWN) */}
      {showBreakdown && stats.breakdown && stats.breakdown.length > 0 && (
        <div className="pt-3 border-t border-slate-800/80 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center justify-between">
            <span>📊 PERBANDINGAN AKURASI PER JENIS REKOMENDASI</span>
            <span className="text-[10px] text-slate-500 font-normal">*AVOID tidak mempengaruhi Win Rate Beli</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {stats.breakdown.map((item: CategoryWinRate, idx: number) => {
              const badge = getActionBadge(item.action);
              const isAvoid = item.action.toUpperCase().includes('AVOID');
              const totalTP = (item.hitTP1 || 0) + (item.hitTP2 || 0);

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border ${
                    isAvoid ? 'bg-slate-950/40 border-slate-800/60 opacity-80' : 'bg-slate-950/80 border-slate-800'
                  } space-y-2`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badge.bg}`}>
                      {badge.label}
                    </span>
                    <span className="text-[10px] text-slate-400">{item.totalAnalyzed} Saham</span>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-400">Win Rate:</span>
                    <span className={`text-lg font-black ${isAvoid ? 'text-slate-400' : 'text-emerald-400'}`}>
                      {item.winRatePct}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/60 pt-1.5">
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

    </div>
  );
};