import React, { useEffect, useState } from 'react';
import { 
  fetchPortfolioHistory, 
  fetchPortfolioWinRateStats, 
  type PortfolioSnapshot, 
  type PortfolioWinRateStats 
} from '../services/portfolioHistoryService';
import { 
  Award, 
  Target, 
  ShieldAlert, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  BarChart2, 
  Percent,
  CheckCircle2
} from 'lucide-react';

export const PortfolioHistoryView: React.FC<{ refreshTrigger?: number }> = ({ refreshTrigger }) => {
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [winStats, setWinStats] = useState<PortfolioWinRateStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [refreshTrigger]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [histData, statsData] = await Promise.all([
        fetchPortfolioHistory(),
        fetchPortfolioWinRateStats(),
      ]);
      setHistory(histData);
      setWinStats(statsData);
    } catch (err) {
      console.error('Gagal memuat histori portofolio:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-md animate-pulse space-y-4">
        <div className="h-5 bg-slate-800 rounded-lg w-1/3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-800/60 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const minVal = history.length > 0 ? Math.min(...history.map((h) => Number(h.total_current_value))) : 0;
  const maxVal = history.length > 0 ? Math.max(...history.map((h) => Number(h.total_current_value))) : 1;
  
  // Kalkulasi perubahan pertumbuhan periode historis
  const firstSnapshot = history[0];
  const lastSnapshot = history[history.length - 1];
  const periodDiff = lastSnapshot && firstSnapshot 
    ? lastSnapshot.total_current_value - firstSnapshot.total_current_value 
    : 0;

  return (
    <div className="space-y-4">
      
      {/* ================= SECTION 1: STATISTIK WIN RATE & REALIZED P/L ================= */}
      {winStats && (
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md space-y-3.5">
          
          {/* Header Baris Utama */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-white tracking-wide">
                  Rekap Transaksi & Win Rate
                </h3>
                <p className="text-[11px] text-slate-400">
                  Evaluasi dari posisi yang sudah direalisasikan (Selesai Beli & Jual)
                </p>
              </div>
            </div>

            <span className="text-[11px] font-bold text-slate-300 bg-slate-950 border border-slate-800 px-3 py-1 rounded-xl flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>{winStats.totalClosed} Posisi Selesai</span>
            </span>
          </div>

          {/* Grid Matriks Performa */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            
            {/* Metric 1: Win Rate % */}
            <div className="bg-slate-950/70 border border-slate-800/80 p-3 rounded-xl space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Percent className="w-3 h-3 text-emerald-400" /> Win Rate
              </span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl sm:text-2xl font-black text-emerald-400">
                  {winStats.winRatePct}%
                </span>
              </div>
            </div>

            {/* Metric 2: Total WIN (TP Hit) */}
            <div className="bg-slate-950/70 border border-slate-800/80 p-3 rounded-xl space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Target className="w-3 h-3 text-emerald-400" /> Total WIN (TP)
              </span>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span className="text-lg font-black text-emerald-400">
                  {winStats.totalWins}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Trade</span>
              </div>
            </div>

            {/* Metric 3: Total LOSS (SL Hit) */}
            <div className="bg-slate-950/70 border border-slate-800/80 p-3 rounded-xl space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-rose-400" /> Total LOSS (SL)
              </span>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span className="text-lg font-black text-rose-400">
                  {winStats.totalLosses}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Trade</span>
              </div>
            </div>

            {/* Metric 4: Realized Profit/Loss */}
            <div className="bg-slate-950/70 border border-slate-800/80 p-3 rounded-xl space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-amber-400" /> Realized P/L Total
              </span>
              <div className="flex items-center space-x-1 mt-0.5">
                {winStats.totalRealizedPLRp >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                )}
                <span className={`text-xs sm:text-sm font-black truncate ${
                  winStats.totalRealizedPLRp >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {winStats.totalRealizedPLRp >= 0 ? '+' : ''}Rp {winStats.totalRealizedPLRp.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ================= SECTION 2: GRAFIK PERKEMBANGAN EQUITY CURVE ================= */}
      {history.length > 0 ? (
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md space-y-3">
          
          {/* Header Grafik */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl shrink-0">
                <BarChart2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-white tracking-wide">
                  Histori Pertumbuhan Equity
                </h3>
                <p className="text-[11px] text-slate-400">
                  Grafik akumulasi modal + keuntungan terealisasi harian
                </p>
              </div>
            </div>

            {history.length > 1 && (
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-slate-400 text-[11px]">Pertumbuhan Periode Ini:</span>
                <span className={`font-extrabold px-2.5 py-0.5 rounded-lg border text-xs flex items-center gap-1 ${
                  periodDiff >= 0 ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-rose-950 text-rose-400 border-rose-800'
                }`}>
                  {periodDiff >= 0 ? '+' : ''}Rp {periodDiff.toLocaleString('id-ID')}
                </span>
              </div>
            )}
          </div>

          {/* Visualisasi Bar Chart */}
          <div className="space-y-2 pt-1">
            <div className="h-32 flex items-end justify-between gap-1.5 pt-6 pb-1 px-2 bg-slate-950/80 rounded-xl border border-slate-800/80 overflow-x-auto custom-scrollbar">
              {history.map((item, idx) => {
                const val = Number(item.total_current_value);
                const range = maxVal - minVal || 1;
                const heightPct = Math.max(18, Math.round(((val - minVal) / range) * 80 + 20));
                const isProfit = Number(item.floating_pl_rp) >= 0;

                return (
                  <div 
                    key={idx} 
                    className="flex-1 flex flex-col items-center h-full justify-end group min-w-[14px] relative"
                  >
                    {/* Tooltip Hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-slate-800 text-slate-100 px-2.5 py-1.5 rounded-lg absolute -top-12 pointer-events-none whitespace-nowrap z-30 border border-slate-700 shadow-2xl">
                      <div className="font-bold text-indigo-300">{item.snapshot_date}</div>
                      <div>Nilai: Rp {val.toLocaleString('id-ID')}</div>
                      <div className={isProfit ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        P/L: {isProfit ? '+' : ''}Rp {Number(item.floating_pl_rp).toLocaleString('id-ID')}
                      </div>
                    </div>

                    {/* Batang Visual */}
                    <div 
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-t-md transition-all duration-300 group-hover:brightness-125 ${
                        isProfit 
                          ? 'bg-gradient-to-t from-emerald-600 to-teal-400 shadow-lg shadow-emerald-950/50' 
                          : 'bg-gradient-to-t from-rose-600 to-amber-500 shadow-lg shadow-rose-950/50'
                      }`} 
                    />
                  </div>
                );
              })}
            </div>

            {/* Label Rentang Tanggal */}
            <div className="flex justify-between text-[10px] text-slate-400 font-mono px-1">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500" />
                {firstSnapshot?.snapshot_date || '-'}
              </span>
              <span>{lastSnapshot?.snapshot_date || '-'}</span>
            </div>
          </div>

        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 text-center space-y-2">
          <BarChart2 className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs text-slate-300 font-semibold">Histori Pertumbuhan Belum Tercatat</p>
          <p className="text-[11px] text-slate-500">
            Klik tombol <strong>"📌 Simpan Histori Hari Ini"</strong> di atas untuk mulai merekam titik grafik pertama Anda.
          </p>
        </div>
      )}

    </div>
  );
};