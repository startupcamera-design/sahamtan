import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { analyzePortfolioItem, type PortfolioItem, type PortfolioAnalysisResult } from '../services/portfolioService';
import { 
  ShieldAlert, 
  TrendingUp, 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Sparkles,
  BarChart3,
  Activity,
  Target,
  PieChart,
  Wallet,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

export const PortfolioAnalyzer: React.FC = () => {
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [tickerInput, setTickerInput] = useState('');
  const [buyPriceInput, setBuyPriceInput] = useState('');
  const [lotsInput, setLotsInput] = useState('1');

  const [analysisResults, setAnalysisResults] = useState<Record<string, PortfolioAnalysisResult>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Portofolio saat pertama kali dimuat
  useEffect(() => {
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    // 1. SELECTIVE FETCHING: Hanya ambil kolom yang dibutuhkan
    const { data } = await supabase
      .from('user_portfolio')
      .select('id, ticker, buy_price, lots, created_at')
      .order('created_at', { ascending: false });

    if (data) {
      const items: PortfolioItem[] = data.map((d) => ({
        id: d.id,
        ticker: d.ticker,
        buy_price: Number(d.buy_price),
        lots: Number(d.lots),
      }));

      setPortfolio(items);

      // 2. LOAD DARI CACHE SUPABASE (Hemat API Call & Egress)
      items.forEach((item) => {
        analyzePortfolioItem(item, false)
          .then((res) => {
            setAnalysisResults((prev) => ({ ...prev, [item.ticker]: res }));
          })
          .catch(() => {
            // Cache belum tersedia atau error silent
          });
      });
    }
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tickerInput || !buyPriceInput || isSubmitting) return;

    setIsSubmitting(true);
    const cleanTicker = tickerInput.toUpperCase().trim();
    const buyPrice = parseFloat(buyPriceInput);
    const lots = parseInt(lotsInput, 10) || 1;

    const newItem = {
      ticker: cleanTicker,
      buy_price: buyPrice,
      lots: lots,
    };

    const { data, error } = await supabase
      .from('user_portfolio')
      .insert([newItem])
      .select('id, ticker, buy_price, lots')
      .single();

    if (!error && data) {
      const addedItem: PortfolioItem = {
        id: data.id,
        ticker: data.ticker,
        buy_price: Number(data.buy_price),
        lots: Number(data.lots),
      };

      setPortfolio([addedItem, ...portfolio]);
      setTickerInput('');
      setBuyPriceInput('');
      setLotsInput('1');
      
      // Otomatis jalankan analisis AI untuk saham baru yang ditambahkan
      runAIAnalysis(addedItem);
    } else if (error) {
      alert(`⚠️ Gagal menambahkan saham: ${error.message}`);
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id?: string, ticker?: string) => {
    if (!id) return;
    if (!confirm(`Hapus ${ticker || 'saham ini'} dari portofolio?`)) return;

    await supabase.from('user_portfolio').delete().eq('id', id);
    setPortfolio(portfolio.filter((p) => p.id !== id));
    
    if (ticker) {
      setAnalysisResults((prev) => {
        const copy = { ...prev };
        delete copy[ticker];
        return copy;
      });
    }
  };

  const runAIAnalysis = async (item: PortfolioItem) => {
    setLoadingMap((prev) => ({ ...prev, [item.ticker]: true }));
    try {
      const res = await analyzePortfolioItem(item, true); // forceRefresh = true
      setAnalysisResults((prev) => ({ ...prev, [item.ticker]: res }));
    } catch (err: any) {
      alert(`⚠️ Gagal menganalisis ${item.ticker}: ${err.message}`);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [item.ticker]: false }));
    }
  };

  // Kalkulasi Summary Statistik Portofolio Total
  const portfolioSummary = useMemo(() => {
    let totalInvestment = 0;
    let totalCurrentValue = 0;
    let healthScores: number[] = [];

    portfolio.forEach((item) => {
      const value = item.buy_price * item.lots * 100;
      totalInvestment += value;

      const res = analysisResults[item.ticker];
      if (res) {
        totalCurrentValue += res.current_price * item.lots * 100;
        healthScores.push(res.health_score);
      } else {
        totalCurrentValue += value; // fallback ke modal awal jika belum dianalisis
      }
    });

    const floatingPLRp = totalCurrentValue - totalInvestment;
    const floatingPLPct = totalInvestment > 0 ? (floatingPLRp / totalInvestment) * 100 : 0;
    const avgHealthScore = healthScores.length > 0 
      ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) 
      : null;

    return {
      totalInvestment,
      totalCurrentValue,
      floatingPLRp,
      floatingPLPct: Number(floatingPLPct.toFixed(2)),
      avgHealthScore,
    };
  }, [portfolio, analysisResults]);

  const getBadgeColor = (action: string) => {
    switch (action) {
      case 'HOLD': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'AVERAGE_UP': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'TAKE_PROFIT': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'CUT_LOSS': return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const getRiskBadgeColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50';
      case 'MEDIUM': return 'text-amber-400 bg-amber-950/40 border-amber-800/50';
      case 'HIGH': return 'text-rose-400 bg-rose-950/40 border-rose-800/50';
      default: return 'text-slate-400 bg-slate-800 border-slate-700';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      
      {/* ================= SUMMARY DASHBOARD PORTOFOLIO ================= */}
      {portfolio.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          
          {/* Card 1: Total Value */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-indigo-400" /> Nilai Portofolio
              </span>
              <span className="text-[11px] text-slate-500">{portfolio.length} Saham</span>
            </div>
            <div className="mt-2">
              <div className="text-lg sm:text-xl font-extrabold text-white">
                Rp {portfolioSummary.totalCurrentValue.toLocaleString('id-ID')}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Modal Beli: Rp {portfolioSummary.totalInvestment.toLocaleString('id-ID')}
              </div>
            </div>
          </div>

          {/* Card 2: Floating Profit / Loss */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-emerald-400" /> Floating P/L Total
              </span>
              {portfolioSummary.floatingPLPct >= 0 ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-0.5">
                  <ArrowUpRight className="w-3 h-3" /> +{portfolioSummary.floatingPLPct}%
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800 flex items-center gap-0.5">
                  <ArrowDownRight className="w-3 h-3" /> {portfolioSummary.floatingPLPct}%
                </span>
              )}
            </div>
            <div className="mt-2">
              <div className={`text-lg sm:text-xl font-extrabold ${portfolioSummary.floatingPLRp >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {portfolioSummary.floatingPLRp >= 0 ? '+' : ''}Rp {portfolioSummary.floatingPLRp.toLocaleString('id-ID')}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Status Un-Realized P/L
              </div>
            </div>
          </div>

          {/* Card 3: Rata-Rata Health Score AI */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" /> Kesehatan AI Avg
              </span>
              <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">4 Pilar Tech</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <div className="text-lg sm:text-xl font-extrabold text-slate-100">
                {portfolioSummary.avgHealthScore !== null ? `${portfolioSummary.avgHealthScore} / 100` : '-'}
              </div>
              {portfolioSummary.avgHealthScore !== null && (
                <span className={`text-xs font-bold ${
                  portfolioSummary.avgHealthScore >= 70 ? 'text-emerald-400' : portfolioSummary.avgHealthScore >= 50 ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {portfolioSummary.avgHealthScore >= 70 ? '🟢 Sehat' : portfolioSummary.avgHealthScore >= 50 ? '🟡 Waspada' : '🔴 Riskan'}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Evaluasi Kombinasi Skor Portofolio
            </div>
          </div>

        </div>
      )}

      {/* ================= FORM TAMBAH SAHAM ================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md space-y-4">
        <h2 className="text-base sm:text-xl font-bold text-slate-100 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <span>Tambah Posisi Portofolio</span>
        </h2>

        <form onSubmit={handleAddStock} className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 sm:hidden">Kode Ticker</label>
            <input
              type="text"
              placeholder="Ticker (cth: BBCA)"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 uppercase text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 sm:hidden">Harga Beli Rata-Rata</label>
            <input
              type="number"
              placeholder="Harga Avg (cth: 9800)"
              value={buyPriceInput}
              onChange={(e) => setBuyPriceInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 sm:hidden">Jumlah Lot</label>
            <input
              type="number"
              placeholder="Jumlah Lot"
              value={lotsInput}
              onChange={(e) => setLotsInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/30 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Simpan Saham</span>
          </button>
        </form>
      </div>

      {/* ================= DAFTAR SAHAM & AI DIAGNOSIS ================= */}
      <div className="space-y-3 sm:space-y-4">
        {portfolio.length === 0 ? (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 space-y-2">
            <PieChart className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-300">Portofolio Anda Masih Kosong</p>
            <p className="text-xs text-slate-500">
              Tambahkan saham yang sedang Anda pegang di atas untuk menganalisis kesehatan tren & aksi bandar secara otomatis.
            </p>
          </div>
        ) : (
          portfolio.map((item) => {
            const res = analysisResults[item.ticker];
            const isLoading = loadingMap[item.ticker];

            return (
              <div 
                key={item.id || item.ticker} 
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl backdrop-blur-md hover:border-slate-700/80 transition-all"
              >
                {/* Header Kartu Saham */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                  
                  <div className="flex items-center gap-3">
                    <span className="text-xl sm:text-2xl font-black text-white tracking-wide">{item.ticker}</span>
                    <span className="text-xs text-slate-300 bg-slate-950 border border-slate-800 px-3 py-1 rounded-xl">
                      Avg: <strong className="text-slate-100">Rp {item.buy_price.toLocaleString('id-ID')}</strong> ({item.lots} Lot)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => runAIAnalysis(item)}
                      disabled={isLoading}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-slate-700 transition font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
                      <span>{res ? 'Re-Analyze AI' : '⚡ Diagnosa AI'}</span>
                    </button>

                    <button
                      onClick={() => handleDelete(item.id, item.ticker)}
                      className="text-slate-500 hover:text-rose-400 p-1.5 rounded-xl transition hover:bg-rose-500/10 border border-transparent hover:border-rose-900/30"
                      title="Hapus Saham"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                </div>

                {/* State: Belum Dianalisis */}
                {!res && !isLoading && (
                  <p className="text-xs sm:text-sm text-slate-500 italic py-1">
                    Klik tombol "⚡ Diagnosa AI" untuk meminta AI mengevaluasi kesehatan tren, pergerakan bandar, dan trailing stop saham ini.
                  </p>
                )}

                {/* State: Loading Diagnosa */}
                {isLoading && (
                  <div className="flex items-center gap-2.5 text-indigo-400 text-xs sm:text-sm py-3 animate-pulse bg-indigo-950/20 px-3 rounded-xl border border-indigo-900/30">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>Gemini AI sedang memproses analisis 4 Pilar (Teknikal, Volume, Price Action & Support)...</span>
                  </div>
                )}

                {/* State: Result Available */}
                {res && !isLoading && (
                  <div className="space-y-3.5 pt-0.5">
                    
                    {/* Ringkasan Rekomendasi Aksi & Live Price */}
                    <div className="flex flex-wrap items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl p-3 sm:p-3.5 gap-3">
                      
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <span className={`px-3 py-1 rounded-lg text-xs font-bold border tracking-wider ${getBadgeColor(res.action_recommendation)}`}>
                          {res.action_recommendation}
                        </span>

                        <span className="text-xs text-slate-300">
                          Skor Kesehatan: <strong className="text-white font-bold">{res.health_score}/100</strong>
                        </span>

                        <span className={`text-[10px] px-2 py-0.5 rounded-md border font-extrabold ${getRiskBadgeColor(res.risk_level)}`}>
                          RISK: {res.risk_level}
                        </span>
                      </div>

                      <div className="text-xs text-slate-300 flex items-center gap-1.5">
                        <span>Harga Sekarang: <strong className="text-white text-sm">Rp {res.current_price.toLocaleString('id-ID')}</strong></span>
                        <span className={`font-bold px-2 py-0.5 rounded-md text-xs ${res.floating_pl_pct >= 0 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}`}>
                          {res.floating_pl_pct >= 0 ? '+' : ''}{res.floating_pl_pct}%
                        </span>
                      </div>

                    </div>

                    {/* Key Stats Grid (4 Pilar) - DIBUAT DENGAN LAYOUT AMAN & TEKS UTUH */}
                    {res.key_stats && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        
                        {/* Pilar 1: Status Tren */}
                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-1.5 min-w-0">
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Status Tren
                          </div>
                          <div className="text-xs font-semibold text-slate-200 leading-snug break-words">
                            {res.key_stats.trend_status}
                          </div>
                        </div>

                        {/* Pilar 2: Bandarmologi */}
                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-1.5 min-w-0">
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                            <BarChart3 className="w-3.5 h-3.5 text-blue-400 shrink-0" /> Bandarmologi
                          </div>
                          <div className="text-xs font-semibold text-slate-200 leading-snug break-words">
                            {res.key_stats.bandarmologi_status}
                          </div>
                        </div>

                        {/* Pilar 3: Price Action */}
                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-1.5 min-w-0">
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                            <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" /> Price Action
                          </div>
                          <div className="text-xs font-semibold text-slate-200 leading-snug break-words">
                            {res.key_stats.price_action_status}
                          </div>
                        </div>

                        {/* Pilar 4: Support / Resis */}
                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-1.5 min-w-0">
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                            <Target className="w-3.5 h-3.5 text-purple-400 shrink-0" /> Support / Resis
                          </div>
                          <div className="text-xs font-semibold text-slate-200 leading-snug break-words">
                            {res.key_stats.support_resistance}
                          </div>
                        </div>

                      </div>
                    )}

                    {/* Alasan Evaluasi AI & Action Plan */}
                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2.5">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        💡 <strong className="text-slate-100">Analisis AI:</strong> {res.key_reason}
                      </p>
                      
                      <div className="flex flex-wrap gap-3 sm:gap-5 text-xs text-slate-400 border-t border-slate-800/60 pt-2.5">
                        <span>Stop Loss Ideal: <strong className="text-rose-400">Rp {res.action_plan.stop_loss_price.toLocaleString('id-ID')}</strong></span>
                        <span>Target Profit: <strong className="text-emerald-400">Rp {res.action_plan.take_profit_price.toLocaleString('id-ID')}</strong></span>
                        {res.action_plan.trailing_stop_price && (
                          <span>Trailing Stop: <strong className="text-amber-400">Rp {res.action_plan.trailing_stop_price.toLocaleString('id-ID')}</strong></span>
                        )}
                      </div>
                    </div>

                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};