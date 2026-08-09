// src/components/PortfolioAnalyzer.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { analyzePortfolioItem, type PortfolioItem, type PortfolioAnalysisResult } from '../services/portfolioService';
import { ShieldAlert, TrendingUp, CheckCircle2, AlertTriangle, Plus, Trash2, RefreshCw, Sparkles } from 'lucide-react';

export const PortfolioAnalyzer: React.FC = () => {
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [tickerInput, setTickerInput] = useState('');
  const [buyPriceInput, setBuyPriceInput] = useState('');
  const [lotsInput, setLotsInput] = useState('1');

  const [analysisResults, setAnalysisResults] = useState<Record<string, PortfolioAnalysisResult>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  // Fetch Portofolio dari Supabase saat awal
  useEffect(() => {
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    const { data } = await supabase.from('user_portfolio').select('*').order('created_at', { ascending: false });
    if (data) {
      setPortfolio(
        data.map((d) => ({
          id: d.id,
          ticker: d.ticker,
          buy_price: Number(d.buy_price),
          lots: Number(d.lots),
        }))
      );
    }
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tickerInput || !buyPriceInput) return;

    const newItem = {
      ticker: tickerInput.toUpperCase().trim(),
      buy_price: parseFloat(buyPriceInput),
      lots: parseInt(lotsInput, 10) || 1,
    };

    const { data, error } = await supabase.from('user_portfolio').insert([newItem]).select().single();

    if (!error && data) {
      setPortfolio([data, ...portfolio]);
      setTickerInput('');
      setBuyPriceInput('');
      setLotsInput('1');
      // Otomatis jalankan analisis AI untuk saham baru
      runAIAnalysis(data);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    await supabase.from('user_portfolio').delete().eq('id', id);
    setPortfolio(portfolio.filter((p) => p.id !== id));
  };

  const runAIAnalysis = async (item: PortfolioItem) => {
    setLoadingMap((prev) => ({ ...prev, [item.ticker]: true }));
    try {
      const res = await analyzePortfolioItem(item);
      setAnalysisResults((prev) => ({ ...prev, [item.ticker]: res }));
    } catch (err: any) {
      alert(`Gagal menganalisis ${item.ticker}: ${err.message}`);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [item.ticker]: false }));
    }
  };

  const getBadgeColor = (action: string) => {
    switch (action) {
      case 'HOLD': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'AVERAGE_UP': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'TAKE_PROFIT': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'CUT_LOSS': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER & FORM TAMBAH PORTOFOLIO */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" /> Analisis Kesehatan Portofolio AI
        </h2>

        <form onSubmit={handleAddStock} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Kode Saham (cth: BBCA)"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 uppercase"
            required
          />
          <input
            type="number"
            placeholder="Harga Beli Avg (cth: 9800)"
            value={buyPriceInput}
            onChange={(e) => setBuyPriceInput(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-100"
            required
          />
          <input
            type="number"
            placeholder="Jumlah Lot"
            value={lotsInput}
            onChange={(e) => setLotsInput(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-100"
            required
          />
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg px-4 py-2 flex items-center justify-center gap-2 transition"
          >
            <Plus className="w-4 h-4" /> Tambah ke Portofolio
          </button>
        </form>
      </div>

      {/* DAFTAR PORTOFOLIO & EVALUASI AI */}
      <div className="space-y-4">
        {portfolio.map((item) => {
          const res = analysisResults[item.ticker];
          const isLoading = loadingMap[item.ticker];

          return (
            <div key={item.id || item.ticker} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-white">{item.ticker}</span>
                  <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-md">
                    Buy: Rp {item.buy_price.toLocaleString()} ({item.lots} Lot)
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => runAIAnalysis(item)}
                    disabled={isLoading}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-slate-700 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    {res ? 'Re-Analyze AI' : '⚡ Minta Diagnosa AI'}
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* JIKA BELUM DI-ANALISIS */}
              {!res && !isLoading && (
                <p className="text-sm text-slate-500 italic">
                  Klik tombol "⚡ Minta Diagnosa AI" untuk mengevaluasi apakah saham ini masih layak di-hold.
                </p>
              )}

              {/* JIKA SEDANG LOADING */}
              {isLoading && (
                <div className="flex items-center gap-2 text-indigo-400 text-sm animate-pulse">
                  <Sparkles className="w-4 h-4" /> Gemini AI sedang mengevaluasi grafik & kondisi posisi Anda...
                </div>
              )}

              {/* HASIL DIAGNOSA AI */}
              {res && !isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400">Status & Rekomendasi AI</div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getBadgeColor(res.action_recommendation)}`}>
                        {res.action_recommendation}
                      </span>
                      <span className="text-xs text-slate-400">Skor Kesehatan: <strong>{res.health_score}/100</strong></span>
                    </div>
                    <div className="text-xs text-slate-300">
                      Harga Saat Ini: <strong className="text-white">Rp {res.current_price.toLocaleString()}</strong> ({res.floating_pl_pct >= 0 ? '+' : ''}{res.floating_pl_pct}%)
                    </div>
                  </div>

                  <div className="md:col-span-2 bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      💡 <strong>Alasan AI:</strong> {res.key_reason}
                    </p>
                    <div className="flex flex-wrap gap-4 text-xs text-slate-400 border-t border-slate-800/60 pt-2">
                      <span>Stop Loss Ideal: <strong className="text-rose-400">Rp {res.action_plan.stop_loss_price}</strong></span>
                      <span>Target Profit: <strong className="text-emerald-400">Rp {res.action_plan.take_profit_price}</strong></span>
                      {res.action_plan.trailing_stop_price && (
                        <span>Trailing Stop: <strong className="text-amber-400">Rp {res.action_plan.trailing_stop_price}</strong></span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};