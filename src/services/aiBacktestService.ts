import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export interface WinRateStats {
  totalAnalyzed: number;
  hitTP1: number;
  hitTP2: number;
  hitSL: number;
  pending: number;
  winRatePct: number;
}

/**
 * Evaluasi Status AI Analysis Cache yang masih PENDING
 */
export async function evaluateAIPerformance() {
  // 1. Ambil analisis AI yang statusnya masih PENDING
  const { data: pendingCaches, error } = await supabase
    .from('ai_analysis_cache')
    .select('*')
    .eq('result_status', 'PENDING');

  if (error || !pendingCaches || pendingCaches.length === 0) {
    console.log('Semua cache AI sudah dievaluasi.');
    return;
  }

  for (const cache of pendingCaches) {
    const plan = typeof cache.trading_plan === 'string' 
      ? JSON.parse(cache.trading_plan) 
      : cache.trading_plan;

    if (!plan || !plan.stop_loss || !plan.target_price_1) continue;

    const slPrice = parseFloat(plan.stop_loss.replace(/[^0-9.]/g, ''));
    const tp1Price = parseFloat(plan.target_price_1.replace(/[^0-9.]/g, ''));
    const tp2Price = plan.target_price_2 ? parseFloat(plan.target_price_2.replace(/[^0-9.]/g, '')) : tp1Price;

    // 2. Cek pergerakan harga setelah tanggal analisis
    const { data: futurePrices } = await supabase
      .from('daily_stock_prices')
      .select('high, low, close')
      .eq('ticker', cache.ticker)
      .gt('date', cache.date)
      .order('date', { ascending: true })
      .limit(15); // Evaluasi window 15 hari bursa berikutnya

    if (!futurePrices || futurePrices.length === 0) continue;

    let maxPrice = 0;
    let minPrice = Infinity;
    let finalStatus = 'PENDING';

    for (const day of futurePrices) {
      const high = Number(day.high);
      const low = Number(day.low);

      if (high > maxPrice) maxPrice = high;
      if (low < minPrice) minPrice = low;

      // Cek mana yang disentuh duluan (SL atau TP)
      if (low <= slPrice) {
        finalStatus = 'HIT_SL';
        break; // Kena Stop Loss lebih dulu
      }
      if (high >= tp2Price) {
        finalStatus = 'HIT_TP2';
        break;
      }
      if (high >= tp1Price && finalStatus !== 'HIT_TP2') {
        finalStatus = 'HIT_TP1';
      }
    }

    // Jika setelah 15 hari belum kena SL/TP, tandai EXPIRED jika minimal sudah kena TP1
    if (finalStatus === 'PENDING' && futurePrices.length >= 15) {
      finalStatus = maxPrice >= tp1Price ? 'HIT_TP1' : 'EXPIRED';
    }

    // 3. Update database cache
    if (finalStatus !== 'PENDING') {
      await supabase
        .from('ai_analysis_cache')
        .update({
          result_status: finalStatus,
          max_price_reached: maxPrice,
          min_price_reached: minPrice,
          evaluated_at: new Date().toISOString(),
        })
        .eq('ticker', cache.ticker)
        .eq('date', cache.date);
    }
  }
}

/**
 * Hitung Ringkasan Win Rate AI untuk Tampilan Dashboard Widget
 */
export async function getAIWinRateStats(): Promise<WinRateStats> {
  const { data, error } = await supabase
    .from('ai_analysis_cache')
    .select('result_status');

  if (error || !data) {
    return { totalAnalyzed: 0, hitTP1: 0, hitTP2: 0, hitSL: 0, pending: 0, winRatePct: 0 };
  }

  const total = data.length;
  const hitTP1 = data.filter(d => d.result_status === 'HIT_TP1').length;
  const hitTP2 = data.filter(d => d.result_status === 'HIT_TP2').length;
  const hitSL = data.filter(d => d.result_status === 'HIT_SL').length;
  const pending = data.filter(d => d.result_status === 'PENDING').length;

  const totalEvaluated = hitTP1 + hitTP2 + hitSL;
  const winRatePct = totalEvaluated > 0 
    ? Number((((hitTP1 + hitTP2) / totalEvaluated) * 100).toFixed(1)) 
    : 0;

  return {
    totalAnalyzed: total,
    hitTP1,
    hitTP2,
    hitSL,
    pending,
    winRatePct,
  };
}