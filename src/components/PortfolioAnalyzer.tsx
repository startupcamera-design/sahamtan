import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { analyzePortfolioItem, type PortfolioItem, type PortfolioAnalysisResult } from '../services/portfolioService';
import { saveDailyPortfolioSnapshot } from '../services/portfolioHistoryService';
import { PortfolioHistoryView } from './PortfolioHistoryView';
import { 
  Plus, 
  Trash2, 
  RefreshCw, 
  Sparkles, 
  PieChart, 
  Wallet, 
  DollarSign, 
  X, 
  Save, 
  Coins, 
  CheckCircle2, 
  Calculator, 
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

export interface ExtendedPortfolioItem extends PortfolioItem {
  stop_loss?: number | null;
  target_price_1?: number | null;
  target_price_2?: number | null;
  status?: string;
  closed_at?: string | null;
  closed_price?: number | null;
}

export const PortfolioAnalyzer: React.FC = () => {
  const [portfolio, setPortfolio] = useState<ExtendedPortfolioItem[]>([]);
  const [cashBalance, setCashBalance] = useState<number>(0);

  // Modal State Control
  const [isAddStockOpen, setIsAddStockOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  
  // State Modal Cash Baru
  const [cashAction, setCashAction] = useState<'SET' | 'DEPOSIT' | 'WITHDRAW'>('SET');
  const [cashInput, setCashInput] = useState('');

  // Form Input Saham Baru
  const [tickerInput, setTickerInput] = useState('');
  const [buyPriceInput, setBuyPriceInput] = useState('');
  const [lotsInput, setLotsInput] = useState('1');
  const [slInput, setSlInput] = useState('');
  const [tp1Input, setTp1Input] = useState('');
  const [tp2Input, setTp2Input] = useState('');
  const [riskTolerancePct, setRiskTolerancePct] = useState('2'); // Default risk 2% per trade

  // Analysis & Loading States
  const [analysisResults, setAnalysisResults] = useState<Record<string, PortfolioAnalysisResult>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);

  // Modal Jual Stock State (Support Partial Sell)
  const [sellingStock, setSellingStock] = useState<ExtendedPortfolioItem | null>(null);
  const [sellPriceInput, setSellPriceInput] = useState('');
  const [sellLotsInput, setSellLotsInput] = useState('1');
  const [isSelling, setIsSelling] = useState(false);

  useEffect(() => {
    fetchPortfolio();
    loadCashBalance();
  }, []);

  const loadCashBalance = () => {
    const savedCash = localStorage.getItem('user_cash_balance');
    if (savedCash) {
      setCashBalance(parseFloat(savedCash) || 0);
    }
  };

  // 🛠️ HANDLER CASH YANG DISESUAIKAN (SUPPORTS DEPOSIT / WITHDRAW / SET)
  const handleSaveCash = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(cashInput) || 0;
    let newCash = cashBalance;

    if (cashAction === 'SET') {
      newCash = val;
    } else if (cashAction === 'DEPOSIT') {
      newCash = cashBalance + val;
    } else if (cashAction === 'WITHDRAW') {
      newCash = Math.max(0, cashBalance - val);
    }

    setCashBalance(newCash);
    localStorage.setItem('user_cash_balance', String(newCash));
    setCashInput('');
    setIsCashModalOpen(false);
  };

  const fetchPortfolio = async () => {
    const { data } = await supabase
      .from('user_portfolio')
      .select('id, ticker, buy_price, lots, stop_loss, target_price_1, target_price_2, status, closed_at, closed_price, created_at')
      .order('created_at', { ascending: false });

    if (data) {
      const items: ExtendedPortfolioItem[] = data.map((d) => ({
        id: d.id,
        ticker: d.ticker,
        buy_price: Number(d.buy_price),
        lots: Number(d.lots),
        stop_loss: d.stop_loss ? Number(d.stop_loss) : null,
        target_price_1: d.target_price_1 ? Number(d.target_price_1) : null,
        target_price_2: d.target_price_2 ? Number(d.target_price_2) : null,
        status: d.status || 'OPEN',
        closed_at: d.closed_at,
        closed_price: d.closed_price ? Number(d.closed_price) : null,
      }));

      setPortfolio(items);

      items.forEach((item) => {
        if (item.status === 'OPEN') {
          analyzePortfolioItem(item, false)
            .then((res) => {
              setAnalysisResults((prev) => ({ ...prev, [item.ticker]: res }));
            })
            .catch(() => {});
        }
      });
    }
  };

  const portfolioSummary = useMemo(() => {
    let totalStockInvestment = 0;
    let totalStockCurrentValue = 0;
    let healthScores: number[] = [];

    const openItems = portfolio.filter((item) => (item.status || 'OPEN') === 'OPEN');

    openItems.forEach((item) => {
      const value = item.buy_price * item.lots * 100;
      totalStockInvestment += value;

      const res = analysisResults[item.ticker];
      if (res) {
        totalStockCurrentValue += res.current_price * item.lots * 100;
        healthScores.push(res.health_score);
      } else {
        totalStockCurrentValue += value;
      }
    });

    const totalEquityValue = totalStockCurrentValue + cashBalance;
    const floatingPLRp = totalStockCurrentValue - totalStockInvestment;
    const floatingPLPct = totalStockInvestment > 0 ? (floatingPLRp / totalStockInvestment) * 100 : 0;
    const avgHealthScore = healthScores.length > 0 
      ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) 
      : null;

    return {
      openCount: openItems.length,
      totalStockInvestment,
      totalStockCurrentValue,
      totalEquityValue,
      floatingPLRp,
      floatingPLPct: Number(floatingPLPct.toFixed(2)),
      avgHealthScore,
    };
  }, [portfolio, analysisResults, cashBalance]);

  // KALKULATOR POSITION SIZING (Risk Management)
  const positionSizingCalc = useMemo(() => {
    const buyP = parseFloat(buyPriceInput);
    const slP = parseFloat(slInput);
    const riskPct = parseFloat(riskTolerancePct) || 2;

    if (!buyP || !slP || slP >= buyP || portfolioSummary.totalEquityValue <= 0) {
      return null;
    }

    const maxRiskRp = portfolioSummary.totalEquityValue * (riskPct / 100);
    const riskPerShare = buyP - slP;
    const maxShares = Math.floor(maxRiskRp / riskPerShare);
    const maxLots = Math.floor(maxShares / 100);
    const recommendedCapital = maxLots * 100 * buyP;

    return {
      maxRiskRp,
      maxLots,
      recommendedCapital,
      riskPerShare,
    };
  }, [buyPriceInput, slInput, riskTolerancePct, portfolioSummary.totalEquityValue]);

  const handleManualSaveSnapshot = async () => {
    setIsSavingSnapshot(true);
    try {
      await saveDailyPortfolioSnapshot({
        totalInvestment: portfolioSummary.totalStockInvestment,
        totalCurrentValue: portfolioSummary.totalStockCurrentValue,
        cashBalance: cashBalance,
        floatingPLRp: portfolioSummary.floatingPLRp,
        stockCount: portfolioSummary.openCount,
      });
      alert('✅ Snapshot histori portofolio berhasil disimpan!');
    } catch (err: any) {
      alert(`⚠️ Gagal menyimpan snapshot: ${err.message}`);
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  // 1. FITUR: TAMBAH SAHAM + AUTOMATIC AVERAGE UP / DOWN
  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tickerInput || !buyPriceInput || isSubmitting) return;

    const cleanTicker = tickerInput.toUpperCase().trim();
    const buyPrice = parseFloat(buyPriceInput);
    const lots = parseInt(lotsInput, 10) || 1;
    const totalCost = buyPrice * lots * 100;

    // Potong Saldo Cash
    if (cashBalance < totalCost) {
      const isProceed = confirm(
        `⚠️ Saldo cash Anda (Rp ${cashBalance.toLocaleString('id-ID')}) kurang dari total biaya beli (Rp ${totalCost.toLocaleString('id-ID')}). Lanjutkan?`
      );
      if (!isProceed) return;
    }

    setIsSubmitting(true);

    const existingPosition = portfolio.find(
      (item) => item.ticker === cleanTicker && (item.status || 'OPEN') === 'OPEN'
    );

    if (existingPosition) {
      // PROSES AVERAGE UP / DOWN
      const oldLots = existingPosition.lots;
      const oldBuyPrice = existingPosition.buy_price;
      const newTotalLots = oldLots + lots;
      
      const newWeightedAvgPrice = Math.round(
        (oldBuyPrice * oldLots + buyPrice * lots) / newTotalLots
      );

      const { error } = await supabase
        .from('user_portfolio')
        .update({
          buy_price: newWeightedAvgPrice,
          lots: newTotalLots,
          stop_loss: slInput ? parseFloat(slInput) : existingPosition.stop_loss,
          target_price_1: tp1Input ? parseFloat(tp1Input) : existingPosition.target_price_1,
          target_price_2: tp2Input ? parseFloat(tp2Input) : existingPosition.target_price_2,
        })
        .eq('id', existingPosition.id);

      if (!error) {
        setPortfolio(
          portfolio.map((item) =>
            item.id === existingPosition.id
              ? {
                  ...item,
                  buy_price: newWeightedAvgPrice,
                  lots: newTotalLots,
                  stop_loss: slInput ? parseFloat(slInput) : item.stop_loss,
                  target_price_1: tp1Input ? parseFloat(tp1Input) : item.target_price_1,
                  target_price_2: tp2Input ? parseFloat(tp2Input) : item.target_price_2,
                }
              : item
          )
        );

        const updatedCash = Math.max(0, cashBalance - totalCost);
        setCashBalance(updatedCash);
        localStorage.setItem('user_cash_balance', String(updatedCash));

        alert(`✅ Successful Average Up/Down ${cleanTicker}! Harga Avg baru: Rp ${newWeightedAvgPrice.toLocaleString('id-ID')} (${newTotalLots} Lot)`);
      } else {
        alert(`⚠️ Gagal Average Up/Down: ${error.message}`);
      }

    } else {
      // PROSES POSISI BARU (NEW ENTRY)
      const newItem = {
        ticker: cleanTicker,
        buy_price: buyPrice,
        lots: lots,
        stop_loss: slInput ? parseFloat(slInput) : null,
        target_price_1: tp1Input ? parseFloat(tp1Input) : null,
        target_price_2: tp2Input ? parseFloat(tp2Input) : null,
        status: 'OPEN',
      };

      const { data, error } = await supabase
        .from('user_portfolio')
        .insert([newItem])
        .select('id, ticker, buy_price, lots, stop_loss, target_price_1, target_price_2, status')
        .single();

      if (!error && data) {
        const addedItem: ExtendedPortfolioItem = {
          id: data.id,
          ticker: data.ticker,
          buy_price: Number(data.buy_price),
          lots: Number(data.lots),
          stop_loss: data.stop_loss ? Number(data.stop_loss) : null,
          target_price_1: data.target_price_1 ? Number(data.target_price_1) : null,
          target_price_2: data.target_price_2 ? Number(data.target_price_2) : null,
          status: 'OPEN',
        };

        setPortfolio([addedItem, ...portfolio]);

        const updatedCash = Math.max(0, cashBalance - totalCost);
        setCashBalance(updatedCash);
        localStorage.setItem('user_cash_balance', String(updatedCash));

        runAIAnalysis(addedItem);
      } else if (error) {
        alert(`⚠️ Gagal menambahkan saham: ${error.message}`);
      }
    }

    setTickerInput('');
    setBuyPriceInput('');
    setLotsInput('1');
    setSlInput('');
    setTp1Input('');
    setTp2Input('');
    setIsAddStockOpen(false);
    setIsSubmitting(false);
  };

  // 2. FITUR: PARTIAL SELL (JUAL BERTAHAP)
  const handleConfirmSell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellingStock || !sellPriceInput || isSelling) return;

    setIsSelling(true);
    const sellPrice = parseFloat(sellPriceInput);
    const sellLots = parseInt(sellLotsInput, 10) || 1;

    if (sellLots > sellingStock.lots) {
      alert(`⚠️ Jumlah lot yang dijual (${sellLots}) melebihi kepemilikan Anda (${sellingStock.lots} Lot).`);
      setIsSelling(false);
      return;
    }

    const isFullSell = sellLots === sellingStock.lots;
    const isWin = sellPrice >= sellingStock.buy_price;
    const proceeds = sellPrice * sellLots * 100;

    if (isFullSell) {
      const { error } = await supabase
        .from('user_portfolio')
        .update({
          status: isWin ? 'WIN' : 'LOSS',
          closed_price: sellPrice,
          closed_at: new Date().toISOString(),
        })
        .eq('id', sellingStock.id);

      if (!error) {
        setPortfolio(
          portfolio.map((item) =>
            item.id === sellingStock.id
              ? { ...item, status: isWin ? 'WIN' : 'LOSS', closed_price: sellPrice }
              : item
          )
        );
      }
    } else {
      const remainingLots = sellingStock.lots - sellLots;

      const { error } = await supabase
        .from('user_portfolio')
        .update({ lots: remainingLots })
        .eq('id', sellingStock.id);

      if (!error) {
        setPortfolio(
          portfolio.map((item) =>
            item.id === sellingStock.id ? { ...item, lots: remainingLots } : item
          )
        );
      }
    }

    const updatedCash = cashBalance + proceeds;
    setCashBalance(updatedCash);
    localStorage.setItem('user_cash_balance', String(updatedCash));

    alert(
      `✅ Berhasil menjual ${sellLots} Lot ${sellingStock.ticker}. Rp ${proceeds.toLocaleString('id-ID')} masuk ke Saldo Cash!`
    );

    setSellingStock(null);
    setSellPriceInput('');
    setSellLotsInput('1');
    setIsSelling(false);
  };

  const handleDelete = async (id?: string, ticker?: string) => {
    if (!id) return;
    if (!confirm(`Hapus permanen ${ticker || 'saham ini'} dari database portofolio?`)) return;

    await supabase.from('user_portfolio').delete().eq('id', id);
    setPortfolio(portfolio.filter((p) => p.id !== id));
  };

  const runAIAnalysis = async (item: ExtendedPortfolioItem) => {
    setLoadingMap((prev) => ({ ...prev, [item.ticker]: true }));
    try {
      const res = await analyzePortfolioItem(item, true);
      setAnalysisResults((prev) => ({ ...prev, [item.ticker]: res }));
    } catch (err: any) {
      alert(`⚠️ Gagal menganalisis ${item.ticker}: ${err.message}`);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [item.ticker]: false }));
    }
  };

  const getBadgeColor = (action: string) => {
    switch (action) {
      case 'HOLD': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'AVERAGE_UP': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'TAKE_PROFIT': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'CUT_LOSS': return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  // Helper format ringkas angka RDN Cash di tombol
  const formatCompactRp = (val: number) => {
    if (val >= 1000000000) return `Rp ${(val / 1000000000).toFixed(1)}M`;
    if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}Jt`;
    return `Rp ${val.toLocaleString('id-ID')}`;
  };

  return (
    <div className="space-y-5">

      {/* ================= HEADER AKSI CEPAT ================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsAddStockOpen(true)}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-2 transition shadow-lg shadow-indigo-950/50 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah / Average Up Saham</span>
          </button>

          {/* Tombol Kelola Cash */}
          <button
            onClick={() => {
              setCashAction('SET');
              setCashInput(cashBalance ? String(cashBalance) : '');
              setIsCashModalOpen(true);
            }}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-2 transition active:scale-95 cursor-pointer"
          >
            <Coins className="w-4 h-4 text-amber-400" />
            <span>Kelola Cash ({formatCompactRp(cashBalance)})</span>
          </button>
        </div>

        <button
          onClick={handleManualSaveSnapshot}
          disabled={isSavingSnapshot}
          className="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-2 transition active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <Save className="w-4 h-4 text-emerald-400" />
          <span>{isSavingSnapshot ? 'Menyimpan...' : '📌 Simpan Snapshot'}</span>
        </button>
      </div>

      {/* ================= HISTORI & WIN RATE VIEW ================= */}
      <PortfolioHistoryView refreshTrigger={portfolioSummary.totalEquityValue} />

      {/* ================= SUMMARY DASHBOARD METRIKS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-1">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase">
            <span className="flex items-center gap-1.5"><Wallet className="w-4 h-4 text-indigo-400" /> Total Portofolio</span>
            <span className="text-[10px] text-slate-500">{portfolioSummary.openCount} Posisi</span>
          </div>
          <div className="text-xl font-extrabold text-white pt-1">
            Rp {portfolioSummary.totalEquityValue.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-slate-400">Total Saham + Saldo Cash</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-1">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase">
            <span className="flex items-center gap-1.5"><Coins className="w-4 h-4 text-amber-400" /> Saldo Cash</span>
          </div>
          <div className="text-xl font-extrabold text-amber-300 pt-1">
            Rp {cashBalance.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-slate-400">Dana Mengendap Siap Pakai</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-1">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase">
            <span className="flex items-center gap-1.5"><PieChart className="w-4 h-4 text-emerald-400" /> Floating P/L</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              portfolioSummary.floatingPLPct >= 0 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
            }`}>
              {portfolioSummary.floatingPLPct >= 0 ? '+' : ''}{portfolioSummary.floatingPLPct}%
            </span>
          </div>
          <div className={`text-xl font-extrabold pt-1 ${portfolioSummary.floatingPLRp >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {portfolioSummary.floatingPLRp >= 0 ? '+' : ''}Rp {portfolioSummary.floatingPLRp.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-slate-400">Posisi Saham Aktif</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-1">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase">
            <span className="flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-purple-400" /> AI Health Avg</span>
          </div>
          <div className="text-xl font-extrabold text-slate-100 pt-1 flex items-center gap-2">
            <span>{portfolioSummary.avgHealthScore !== null ? `${portfolioSummary.avgHealthScore}/100` : '-'}</span>
          </div>
          <p className="text-[11px] text-slate-400">Evaluasi Rata-rata 4 Pilar</p>
        </div>
      </div>

      {/* ================= DAFTAR KARTU SAHAM PORTOFOLIO ================= */}
      <div className="space-y-3">
        {portfolio.length === 0 ? (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 space-y-2">
            <PieChart className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-300">Portofolio Saham Kosong</p>
          </div>
        ) : (
          portfolio.map((item) => {
            const res = analysisResults[item.ticker];
            const isLoading = loadingMap[item.ticker];
            const isClosed = item.status === 'WIN' || item.status === 'LOSS';
            const currentPrice = res?.current_price || item.closed_price || item.buy_price;

            return (
              <div 
                key={item.id || item.ticker} 
                className={`bg-slate-900/90 border rounded-2xl p-4 space-y-3 shadow-xl backdrop-blur-md transition-all ${
                  isClosed ? 'border-slate-800/60 opacity-60 bg-slate-950/40' : 'border-slate-800 hover:border-slate-700/80'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl font-black text-white">{item.ticker}</span>
                    <span className="text-xs text-slate-300 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-xl">
                      Avg: <strong className="text-slate-100">Rp {item.buy_price.toLocaleString('id-ID')}</strong> ({item.lots} Lot)
                    </span>

                    {isClosed && (
                      <span className={`text-xs font-black px-2 py-0.5 rounded-lg border ${
                        item.status === 'WIN' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-rose-950 text-rose-400 border-rose-800'
                      }`}>
                        {item.status === 'WIN' ? '✅ WIN' : '🚨 LOSS'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!isClosed && (
                      <>
                        <button
                          onClick={() => {
                            setSellingStock(item);
                            setSellPriceInput(currentPrice ? String(currentPrice) : '');
                            setSellLotsInput(String(item.lots));
                          }}
                          className="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-bold transition active:scale-95 cursor-pointer"
                        >
                          <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Jual (Partial/Full)</span>
                        </button>

                        <button
                          onClick={() => runAIAnalysis(item)}
                          disabled={isLoading}
                          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-slate-700 transition font-semibold cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
                          <span>{res ? 'Re-Analyze' : '⚡ Diagnosa'}</span>
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => handleDelete(item.id, item.ticker)}
                      className="text-slate-500 hover:text-rose-400 p-1.5 rounded-xl transition hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {res && !isLoading && (
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 flex justify-between items-center">
                    <span className={`px-2.5 py-0.5 rounded-lg font-bold border ${getBadgeColor(res.action_recommendation)}`}>
                      {res.action_recommendation}
                    </span>
                    <span>Harga: <strong className="text-white">Rp {res.current_price.toLocaleString('id-ID')}</strong></span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ================= MODAL TAMBAH SAHAM + KALKULATOR RISK MANAGEMENT ================= */}
      {isAddStockOpen && (
        <div className="fixed inset-0 z-[999999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden text-slate-200">
            
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base text-white">Tambah / Average Up Saham</h3>
              </div>
              <button onClick={() => setIsAddStockOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStock} className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Ticker *</label>
                  <input
                    type="text"
                    placeholder="cth: BBCA"
                    value={tickerInput}
                    onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 uppercase text-xs font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Harga Beli *</label>
                  <input
                    type="number"
                    placeholder="cth: 9800"
                    value={buyPriceInput}
                    onChange={(e) => setBuyPriceInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 text-xs font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Jumlah Lot *</label>
                  <input
                    type="number"
                    placeholder="cth: 10"
                    value={lotsInput}
                    onChange={(e) => setLotsInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 text-xs font-bold"
                    required
                  />
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-3 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 block">Target SL & Risk Sizing</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-rose-400 font-bold mb-0.5">Stop Loss (SL)</label>
                    <input
                      type="number"
                      placeholder="Harga SL"
                      value={slInput}
                      onChange={(e) => setSlInput(e.target.value)}
                      className="w-full bg-slate-950 border border-rose-950/60 rounded-xl px-2.5 py-1.5 text-rose-300 font-bold text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-amber-400 font-bold mb-0.5">Max Risk (%)</label>
                    <input
                      type="number"
                      placeholder="2%"
                      value={riskTolerancePct}
                      onChange={(e) => setRiskTolerancePct(e.target.value)}
                      className="w-full bg-slate-950 border border-amber-950/60 rounded-xl px-2.5 py-1.5 text-amber-300 font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* REKOMENDASI KALKULATOR POSITION SIZING */}
              {positionSizingCalc && (
                <div className="bg-indigo-950/30 border border-indigo-900/50 p-3 rounded-xl text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-indigo-400 font-bold">
                    <Calculator className="w-4 h-4" />
                    <span>Rekomendasi Risk Sizing (Max Risk {riskTolerancePct}%):</span>
                  </div>
                  <div className="flex justify-between text-slate-300 pt-0.5">
                    <span>Maksimal Toleransi Loss:</span>
                    <strong className="text-rose-400">Rp {positionSizingCalc.maxRiskRp.toLocaleString('id-ID')}</strong>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Rekomendasi Lot Aman:</span>
                    <strong className="text-emerald-400 font-black">{positionSizingCalc.maxLots} Lot</strong>
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddStockOpen(false)} className="px-4 py-2 bg-slate-800 text-xs font-semibold rounded-xl">
                  Batal
                </button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2 bg-indigo-600 text-xs font-bold rounded-xl shadow-lg">
                  Simpan / Average Up
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ================= MODAL JUAL SAHAM (PARTIAL & FULL SELL) ================= */}
      {sellingStock && (
        <div className="fixed inset-0 z-[999999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-slate-200">
            
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <h3 className="font-bold text-base text-white">
                Jual Position: <span className="text-emerald-400">{sellingStock.ticker}</span>
              </h3>
              <button onClick={() => setSellingStock(null)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSell} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Harga Jual *</label>
                  <input
                    type="number"
                    value={sellPriceInput}
                    onChange={(e) => setSellPriceInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-bold text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Lot Dijual * (Max {sellingStock.lots})</label>
                  <input
                    type="number"
                    value={sellLotsInput}
                    onChange={(e) => setSellLotsInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold text-sm"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setSellingStock(null)} className="px-4 py-2 bg-slate-800 text-xs font-semibold rounded-xl">
                  Batal
                </button>
                <button type="submit" disabled={isSelling} className="px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-lg">
                  Konfirmasi Jual
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ================= MODAL KELOLA CASH (DISEMPURNAKAN DENGAN MODE DEPOSIT / WITHDRAW / SET) ================= */}
      {isCashModalOpen && (
        <div className="fixed inset-0 z-[999999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-slate-200">
            
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-white">Kelola Saldo Cash (RDN)</h3>
              </div>
              <button onClick={() => setIsCashModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCash} className="p-5 space-y-4">
              
              {/* Opsi Mode Aksi Cash */}
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => { setCashAction('SET'); setCashInput(String(cashBalance)); }}
                  className={`py-1.5 rounded-lg transition ${cashAction === 'SET' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Set Saldo
                </button>
                <button
                  type="button"
                  onClick={() => { setCashAction('DEPOSIT'); setCashInput(''); }}
                  className={`py-1.5 rounded-lg transition flex items-center justify-center gap-1 ${cashAction === 'DEPOSIT' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" /> Top Up
                </button>
                <button
                  type="button"
                  onClick={() => { setCashAction('WITHDRAW'); setCashInput(''); }}
                  className={`py-1.5 rounded-lg transition flex items-center justify-center gap-1 ${cashAction === 'WITHDRAW' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <ArrowDownRight className="w-3.5 h-3.5" /> Tarik Cash
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {cashAction === 'SET' && 'Masukkan Total Saldo Cash Saat Ini (Rp)'}
                  {cashAction === 'DEPOSIT' && 'Nominal Top Up / Tambah Modal (Rp)'}
                  {cashAction === 'WITHDRAW' && 'Nominal Penarikan Dana RDN (Rp)'}
                </label>
                <input
                  type="number"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  placeholder="0"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-amber-300 font-black text-base focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Saldo Cash Saat Ini:</span>
                  <strong className="text-amber-300">Rp {cashBalance.toLocaleString('id-ID')}</strong>
                </div>
                {cashInput && cashAction !== 'SET' && (
                  <div className="flex justify-between pt-1 border-t border-slate-800/80">
                    <span>Estimasi Saldo Baru:</span>
                    <strong className="text-emerald-400">
                      Rp { (cashAction === 'DEPOSIT' ? cashBalance + (parseFloat(cashInput) || 0) : Math.max(0, cashBalance - (parseFloat(cashInput) || 0))).toLocaleString('id-ID') }
                    </strong>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsCashModalOpen(false)} className="px-4 py-2 bg-slate-800 text-xs font-semibold rounded-xl text-slate-300">
                  Batal
                </button>
                <button type="submit" className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-lg">
                  Simpan Perubahan
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};