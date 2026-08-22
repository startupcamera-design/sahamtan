import { supabase } from '../lib/supabase';

export interface PortfolioSnapshot {
  snapshot_date: string;
  total_investment: number;    // Modal Pokok Aktual (Warna Modal)
  total_current_value: number; // Total Nilai Aset (Saham Aktif + Cash)
  floating_pl_rp: number;      // Profit/Loss Murni (Rp)
  floating_pl_pct: number;     // Profit/Loss Murni (%)
  stock_count: number;
}

export interface PortfolioWinRateStats {
  totalClosed: number;
  totalWins: number;
  totalLosses: number;
  winRatePct: number;
  totalRealizedPLRp: number;
}

// A. Simpan snapshot nilai portofolio hari ini ke database
export const saveDailyPortfolioSnapshot = async (summary: {
  totalInvestment: number;      // Total modal pada saham aktif
  totalCurrentValue: number;   // Nilai berjalan saham aktif
  cashBalance?: number;        // Saldo cash aktif
  floatingPLRp: number;        // Floating P/L saham aktif (Rp)
  floatingPLPct?: number;
  stockCount: number;
}) => {
  const today = new Date().toISOString().split('T')[0];

  // 1. Hitung total Realized Profit/Loss dari semua transaksi yang SUDAH DIJUAL (WIN / LOSS)
  const { data: closedPositions, error: closedError } = await supabase
    .from('user_portfolio')
    .select('buy_price, closed_price, lots, status')
    .in('status', ['WIN', 'LOSS']);

  let totalRealizedPLRp = 0;

  if (!closedError && closedPositions) {
    closedPositions.forEach((item) => {
      if (item.closed_price && item.buy_price) {
        const profitLoss = (Number(item.closed_price) - Number(item.buy_price)) * Number(item.lots) * 100;
        totalRealizedPLRp += profitLoss;
      }
    });
  }

  // 2. KALKULASI MURNI:
  // - Net Profit Murni (Rp) = Floating P/L Saham Aktif + Realized Profit Penjualan
  const netProfitRp = summary.floatingPLRp + totalRealizedPLRp;
  
  // - Total Nilai Aset Portofolio = Nilai Saham Aktif + Saldo Cash
  const activeCash = summary.cashBalance || 0;
  const netTotalPortfolioValue = summary.totalCurrentValue + activeCash;

  // - Total Modal Pokok Aktual = Total Aset - Net Profit
  // (Mengisolasi top-up modal agar tidak terhitung sebagai keuntungan)
  const netCapitalBase = Math.max(1, netTotalPortfolioValue - netProfitRp);
  
  // - % Return Murni Trading
  const pureReturnPct = Number(((netProfitRp / netCapitalBase) * 100).toFixed(2));

  // 3. Simpan / Perbarui Snapshot Hari Ini (UPSERT)
  const { error } = await supabase
    .from('portfolio_history')
    .upsert(
      {
        snapshot_date: today,
        total_investment: netCapitalBase,          // Menyimpan Modal Pokok Murni
        total_current_value: netTotalPortfolioValue, // Menyimpan Total Aset (Saham + Cash)
        floating_pl_rp: netProfitRp,                 // Menyimpan Total Profit Murni (Rp)
        floating_pl_pct: pureReturnPct,              // Menyimpan % Return Murni
        stock_count: summary.stockCount,
      },
      { onConflict: 'snapshot_date' }
    );

  if (error) {
    console.error('Gagal menyimpan snapshot histori portofolio:', error);
    throw new Error(error.message);
  }
};

// B. Ambil data histori portofolio (30 snapshot terakhir)
export const fetchPortfolioHistory = async (): Promise<PortfolioSnapshot[]> => {
  const { data, error } = await supabase
    .from('portfolio_history')
    .select('*')
    .order('snapshot_date', { ascending: true })
    .limit(30);

  if (error) {
    console.error('Gagal mengambil histori portofolio:', error);
    return [];
  }

  return data || [];
};

// C. Hitung Win Rate (Berapa banyak posisi WIN vs LOSS)
export const fetchPortfolioWinRateStats = async (): Promise<PortfolioWinRateStats> => {
  const { data, error } = await supabase
    .from('user_portfolio')
    .select('status, buy_price, closed_price, lots');

  if (error || !data) {
    return { totalClosed: 0, totalWins: 0, totalLosses: 0, winRatePct: 0, totalRealizedPLRp: 0 };
  }

  let totalWins = 0;
  let totalLosses = 0;
  let totalRealizedPLRp = 0;

  data.forEach((item) => {
    if (item.status === 'WIN' || item.status === 'LOSS') {
      if (item.status === 'WIN') totalWins++;
      if (item.status === 'LOSS') totalLosses++;

      if (item.closed_price && item.buy_price) {
        totalRealizedPLRp += (Number(item.closed_price) - Number(item.buy_price)) * Number(item.lots) * 100;
      }
    }
  });

  const totalClosed = totalWins + totalLosses;
  const winRatePct = totalClosed > 0 ? Math.round((totalWins / totalClosed) * 100) : 0;

  return { totalClosed, totalWins, totalLosses, winRatePct, totalRealizedPLRp };
};