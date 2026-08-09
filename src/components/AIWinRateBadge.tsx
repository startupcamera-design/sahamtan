import React, { useEffect, useState } from 'react';
import { getAIWinRateStats, evaluateAIPerformance, type WinRateStats } from '../services/aiBacktestService';
import { Award, RefreshCw, Target, ShieldAlert, Clock, Sparkles } from 'lucide-react';

export const AIWinRateBadge: React.FC = () => {
  const [stats, setStats] = useState<WinRateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Tampilan Skeleton saat pertama kali memuat data
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

  // Jika belum ada data backtest sama sekali
  if (!stats || (stats.totalAnalyzed === 0)) {
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
    <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 text-white shadow-xl backdrop-blur-md my-4 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between transition-all">
      
      {/* Sisi Kiri: Win Rate Utama */}
      <div className="flex items-center space-x-3.5">
        <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl shrink-0 shadow-inner">
          <Award className="w-6 h-6" />
        </div>
        
        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <span>Akurasi Trading Plan AI</span>
            <span className="text-[10px] text-slate-500 font-normal">({stats.totalAnalyzed || 0} Saham)</span>
          </div>

          <div className="flex items-baseline space-x-2 mt-0.5">
            <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight">
              {stats.winRatePct}%
            </span>
            <span className="text-xs font-semibold text-slate-300">
              Win Rate Success
            </span>
          </div>
        </div>
      </div>

      {/* Sisi Kanan: Rincian Stat & Refresh Action */}
      <div className="flex items-center justify-between sm:justify-end space-x-2 sm:space-x-4 text-xs border-t sm:border-t-0 border-slate-800/80 pt-3 sm:pt-0">
        
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
        {stats.pending !== undefined && (
          <div className="flex items-center space-x-1.5 bg-slate-950/60 border border-slate-800 px-2.5 py-1.5 rounded-xl">
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div>
              <span className="block text-amber-400 font-extrabold leading-none">{stats.pending}</span>
              <span className="text-[10px] text-slate-400">Aktif</span>
            </div>
          </div>
        )}

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
  );
};