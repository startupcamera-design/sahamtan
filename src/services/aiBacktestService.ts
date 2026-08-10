import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export interface CategoryWinRate {
  action: string;
  totalAnalyzed: number;
  hitTP1: number;
  hitTP2: number;
  hitSL: number;
  pending: number;
  winRatePct: number;
}

export interface WinRateStats {
  totalAnalyzed: number;
  hitTP1: number;
  hitTP2: number;
  hitSL: number;
  pending: number;
  winRatePct: number;
  breakdown?: CategoryWinRate[];
}

/**
 * Evaluasi Status AI Analysis Cache yang masih PENDING via RPC Supabase
 * Mengeksekusi penentuan HIT_TP1, HIT_TP2, HIT_SL, atau EXPIRED secara otomatis di DB Server.
 */
export async function evaluateAIPerformance(): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('evaluate_pending_ai_cache');
    if (error) {
      console.error('Gagal mengevaluasi AI via RPC:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Terjadi kesalahan saat memanggil RPC evaluate_pending_ai_cache:', err);
    return false;
  }
}

/**
 * Hitung Ringkasan Win Rate AI via PostgreSQL View (v_ai_win_rate_stats)
 * Menghemat Egress & RAM client secara signifikan serta menyediakan breakdown per jenis rekomendasi.
 */
export async function getAIWinRateStats(): Promise<WinRateStats> {
  try {
    const { data, error } = await supabase
      .from('v_ai_win_rate_stats')
      .select('*')
      .maybeSingle();

    if (error || !data) {
      console.error('Gagal memuat view win rate stats:', error);
      return { 
        totalAnalyzed: 0, 
        hitTP1: 0, 
        hitTP2: 0, 
        hitSL: 0, 
        pending: 0, 
        winRatePct: 0,
        breakdown: [] 
      };
    }

    // Parsing breakdown JSON jika datang dalam bentuk String dari DB
    let parsedBreakdown: CategoryWinRate[] = [];
    if (data.breakdown) {
      parsedBreakdown = typeof data.breakdown === 'string'
        ? JSON.parse(data.breakdown)
        : data.breakdown;
    }

    return {
      totalAnalyzed: Number(data.total_analyzed) || 0,
      hitTP1: Number(data.hit_tp1) || 0,
      hitTP2: Number(data.hit_tp2) || 0,
      hitSL: Number(data.hit_sl) || 0,
      pending: Number(data.pending) || 0,
      winRatePct: Number(data.win_rate_pct) || 0,
      breakdown: parsedBreakdown,
    };
  } catch (err) {
    console.error('Terjadi error saat mengambil statistik Win Rate AI:', err);
    return {
      totalAnalyzed: 0,
      hitTP1: 0,
      hitTP2: 0,
      hitSL: 0,
      pending: 0,
      winRatePct: 0,
      breakdown: [],
    };
  }
}