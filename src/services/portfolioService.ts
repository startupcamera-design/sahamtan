// src/services/portfolioService.ts
import { supabase } from '../lib/supabase';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Menggunakan Fallback Chain Gemini Models
const PORTFOLIO_GEMINI_MODELS = [
  'gemini-3.5-flash-lite'
];

export interface PortfolioItem {
  id?: string;
  ticker: string;
  buy_price: number;
  lots: number;
  buy_date?: string;
}

export interface KeyStats {
  trend_status: string;        // Contoh: "Strong Uptrend (Di atas MA20 & MA50)"
  bandarmologi_status: string; // Contoh: "Akumulasi Kuat (Rasio Vol 1.6x)"
  price_action_status: string; // Contoh: "Higher High & Higher Low 3 Hari"
  support_resistance: string;  // Contoh: "Support MA20: Rp 1.450 | Resis 30D: Rp 1.800"
}

export interface PortfolioAnalysisResult {
  ticker: string;
  buy_price: number;
  current_price: number;
  floating_pl_pct: number;
  health_score: number; // 0 - 100
  action_recommendation: 'HOLD' | 'AVERAGE_UP' | 'TAKE_PROFIT' | 'CUT_LOSS';
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  key_reason: string;
  key_stats: KeyStats; // Rangkuman Metrik Utama (Keystat)
  action_plan: {
    stop_loss_price: number;
    take_profit_price: number;
    trailing_stop_price?: number;
  };
  fromCache?: boolean;
}

/**
 * Panggil Gemini API khusus untuk evaluasi Portofolio dengan sistem Fallback Model
 */
async function callPortfolioGemini(prompt: string): Promise<string> {
  let lastError = '';

  for (const model of PORTFOLIO_GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1, // Respons sangat konsisten & logis
            },
          }),
        }
      );

      const json = await response.json();
      if (!response.ok) {
        lastError = json.error?.message || response.statusText;
        continue;
      }

      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch (err: any) {
      lastError = err.message || err;
    }
  }

  throw new Error(`Gagal memanggil Gemini AI Portofolio: ${lastError}`);
}

/**
 * Fungsi Utama Evaluasi Portofolio Saham via AI (Dengan Caching Supabase & Penajaman Teknikal + Bandarmologi + KeyStats)
 */
export async function analyzePortfolioItem(
  item: PortfolioItem,
  forceRefresh = false
): Promise<PortfolioAnalysisResult> {
  // 1. Ambil 30 hari data historis harga saham terkait dari Supabase
  const { data: history } = await supabase
    .from('daily_stock_prices')
    .select('date, open, high, low, close, volume')
    .eq('ticker', item.ticker)
    .order('date', { ascending: false })
    .limit(30);

  if (!history || history.length === 0) {
    throw new Error(`Data historis harga untuk ${item.ticker} tidak ditemukan.`);
  }

  const chronological = [...history].reverse();
  const latestDate = chronological[chronological.length - 1].date; // Tanggal bursa terakhir
  const currentClose = Number(chronological[chronological.length - 1].close);
  const floatingPLPct = Number((((currentClose - item.buy_price) / item.buy_price) * 100).toFixed(2));

  // 2. CEK CACHE SUPABASE (Tabel: portfolio_analysis_cache)
  if (!forceRefresh) {
    const { data: cached } = await supabase
      .from('portfolio_analysis_cache')
      .select('*')
      .eq('ticker', item.ticker)
      .eq('date', latestDate)
      .eq('buy_price', item.buy_price)
      .maybeSingle();

    if (cached) {
      console.log(`⚡ Diagnosa Portofolio ${item.ticker} dimuat dari Cache Supabase!`);
      
      // Parse key_stats jika dalam format String JSON
      const parsedKeyStats: KeyStats =
        typeof cached.key_stats === 'string'
          ? JSON.parse(cached.key_stats)
          : cached.key_stats || {
              trend_status: cached.current_price >= cached.buy_price ? 'Uptrend' : 'Downtrend',
              bandarmologi_status: 'Netral',
              price_action_status: 'Stabil',
              support_resistance: 'Lihat Grafik',
            };

      return {
        ticker: cached.ticker,
        buy_price: Number(cached.buy_price),
        current_price: Number(cached.current_price),
        floating_pl_pct: Number(cached.floating_pl_pct),
        health_score: cached.health_score,
        action_recommendation: cached.action_recommendation,
        risk_level: cached.risk_level,
        key_reason: cached.key_reason,
        key_stats: parsedKeyStats,
        action_plan:
          typeof cached.action_plan === 'string'
            ? JSON.parse(cached.action_plan)
            : cached.action_plan,
        fromCache: true,
      };
    }
  }

  // 3. JIKA TIDAK ADA DI CACHE / FORCE REFRESH: Hitung Indikator & Panggil Gemini AI

  // Hitung durasi memegang saham (holding period)
  const buyDateObj = item.buy_date ? new Date(item.buy_date) : new Date();
  const holdingDays = Math.max(
    1,
    Math.floor((new Date().getTime() - buyDateObj.getTime()) / (1000 * 3600 * 24))
  );

  // Perhitungan Teknikal Dasar
  const closes = chronological.map((h) => Number(h.close));
  const highs = chronological.map((h) => Number(h.high));
  const lows = chronological.map((h) => Number(h.low));
  const volumes = chronological.map((h) => Number(h.volume));

  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(closes.length, 20);
  const ma50 = closes.reduce((a, b) => a + b, 0) / closes.length;
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(volumes.length, 20);

  // Metrik Tren & Price Action (3 Hari Terakhir)
  const recent3Closes = closes.slice(-3);
  const recent3Highs = highs.slice(-3);
  const recent3Lows = lows.slice(-3);
  
  const isContinuousRising3D = recent3Closes[2] > recent3Closes[1] && recent3Closes[1] > recent3Closes[0];
  const isHigherHighs3D = recent3Highs[2] > recent3Highs[1] && recent3Highs[1] > recent3Highs[0];
  const isHigherLows3D = recent3Lows[2] > recent3Lows[1] && recent3Lows[1] > recent3Lows[0];

  // Metrik Bandarmologi & Volume Dynamics (10 Hari Terakhir)
  const last10 = chronological.slice(-10);
  let totalUpVolume = 0;
  let totalDownVolume = 0;
  let upDaysCount = 0;
  let downDaysCount = 0;

  last10.forEach((h) => {
    const c = Number(h.close);
    const o = Number(h.open);
    const v = Number(h.volume);
    if (c >= o) {
      totalUpVolume += v;
      upDaysCount++;
    } else {
      totalDownVolume += v;
      downDaysCount++;
    }
  });

  const avgUpVolume10d = upDaysCount > 0 ? totalUpVolume / upDaysCount : 1;
  const avgDownVolume10d = downDaysCount > 0 ? totalDownVolume / downDaysCount : 1;
  // Jika Ratio > 1.2, indikasi Akumulasi Bandar (Big Money Masuk Saat Naik)
  const bandarVolumeRatio10d = Number((avgUpVolume10d / avgDownVolume10d).toFixed(2));

  // Detail 5 Hari Terakhir dengan status Candle & Volume vs Rata-Rata
  const last5Detail = chronological.slice(-5).map((h) => {
    const c = Number(h.close);
    const o = Number(h.open);
    const v = Number(h.volume);
    return {
      date: h.date,
      open: o,
      high: Number(h.high),
      low: Number(h.low),
      close: c,
      volume: v,
      vol_vs_ma20_pct: Number(((v / avgVol20) * 100).toFixed(1)),
      candle_type: c > o ? 'BULLISH' : c < o ? 'BEARISH' : 'DOJI',
    };
  });

  const payload = {
    ticker: item.ticker,
    analysis_date: latestDate,
    portfolio_position: {
      buy_price: item.buy_price,
      current_price: currentClose,
      floating_pl_pct: `${floatingPLPct}%`,
      lots: item.lots,
      holding_days: holdingDays,
    },
    trend_health: {
      ma20: Math.round(ma20),
      ma50: Math.round(ma50),
      is_above_ma20: currentClose >= ma20,
      is_above_ma50: currentClose >= ma50,
      is_continuous_rising_3d: isContinuousRising3D,
      is_making_higher_highs: isHigherHighs3D,
      is_making_higher_lows: isHigherLows3D,
      dist_to_ma20_pct: Number((((currentClose - ma20) / ma20) * 100).toFixed(2)),
      dist_to_ma50_pct: Number((((currentClose - ma50) / ma50) * 100).toFixed(2)),
      recent_high_30d: Math.max(...highs),
      recent_low_30d: Math.min(...lows),
    },
    bandarmologi_and_volume_dynamics: {
      avg_volume_20d: Math.round(avgVol20),
      latest_vol_vs_avg20_pct: Number(((volumes[volumes.length - 1] / avgVol20) * 100).toFixed(1)),
      bandar_volume_ratio_10d: bandarVolumeRatio10d,
      bandar_status_10d:
        bandarVolumeRatio10d > 1.3
          ? 'STRONG_ACCUMULATION'
          : bandarVolumeRatio10d > 1.0
          ? 'ACCUMULATION'
          : bandarVolumeRatio10d < 0.7
          ? 'DISTRIBUTION'
          : 'NEUTRAL',
    },
    last_5_days_ohlcv: last5Detail,
  };

  const prompt = `
Anda adalah Portfolio Manager Senior, Technical Analyst, & Pakar Bandarmologi Pasar Saham Indonesia (IHSG).
Tugas Anda adalah mengevaluasi posisi portofolio saham berdasarkan sinyal sinergi antara Price Action (Chart) dan Volume Dynamics (Bandarmologi).

PRINSIP UTAMA ANDA: "LET YOUR PROFITS RUN, CUT YOUR LOSSES SHORT".
DILARANG keras merekomendasikan TAKE PROFIT HANYA KARENA PERSENTASE PROFIT SUDAH TINGGI (misal profit > +10% atau +20%), apabila tren teknikal masih Strong Uptrend dan data Bandarmologi menunjukkan Bandar masih melakukan Akumulasi/Markup!

Data Lengkap Saham:
${JSON.stringify(payload, null, 2)}

---
### 📐 HIRARKI LOGIKA KEPUTUSAN TERPADU (TEKNIKAL + BANDARMOLOGI):

1. **HOLD / RIDE THE TREND (Simpan Posisi)**:
   - **Kondisi**: Floating profit berapapun (termasuk > +15% s/d +50%).
   - Harga konsisten di atas MA20/MA50, terus membentuk Higher Highs / Higher Lows, DAN volume saat koreksi/pullback mengering (Volume Down kecil) atau Bandar masih status ACCUMULATION/STRONG_ACCUMULATION.
   - **Tindakan**: Rekomendasikan "HOLD". Naikkan level 'trailing_stop_price' secara bertahap di bawah Low kunci atau MA20 untuk mengunci profit tanpa menghentikan potensi kenaikan.

2. **AVERAGE_UP (Tambah Muatan)**:
   - **Kondisi**: Sedang Floating Profit (> +2%).
   - Harga mengalami koreksi sehat (pullback) mendekati MA20 dengan volume sangat kecil (VCP / cooling down), sementara data Bandarmologi 10 hari menunjukkan Akumulasi kuat.
   - **Tindakan**: Rekomendasikan "AVERAGE_UP".

3. **TAKE_PROFIT / PARTIAL_TP (Amankan Sebagian atau Total)**:
   - **Kondisi HANYA jika muncul tanda-tanda kelemahan nyata**:
     a) **Uptrend Melemah/Jenuh Beli**: Harga naik tetapi Volume menurun drastis (Divergensi Volume) ATAU muncul candle pembalikan arah di resistance (Shooting Star, Hanging Man, Bearish Engulfing dengan ekor atas panjang).
     b) **Distribusi Bandar**: Terjadi lonjakan volume besar saat harga ditutup merah (Volume Spikes on Down Days) atau bandar_status_10d berubah menjadi "DISTRIBUTION".
   - **Tindakan**: Rekomendasikan "TAKE_PROFIT" (atau sarankan di key_reason untuk Partial TP 50%).

4. **CUT_LOSS (Batasi Kerugian)**:
   - **Kondisi**: Harga ditutup Breakdown di bawah MA50 / Support Kunci dengan volume di atas rata-rata 20 hari (Volume Spike), ATAU Floating Loss menembus batas toleransi teknikal (> -5% s/d -7%).
   - **Tindakan**: Rekomendasikan "CUT_LOSS".

---
WAJIB tanggapi HANYA dengan JSON valid berikut tanpa format markdown pembuka/penutup:

{
  "health_score": 90,
  "action_recommendation": "HOLD",
  "risk_level": "LOW",
  "key_reason": "Saham dalam kondisi Strong Uptrend (di atas MA20) didukung Akumulasi Bandar (Ratio Vol 1.6x). Meskipun profit sudah +18%, tidak ada sinyal distribusi. Tetap Hold dan naikkan Trailing Stop ke Rp 1.550.",
  "key_stats": {
    "trend_status": "Strong Uptrend (+3.2% di atas MA20)",
    "bandarmologi_status": "Strong Accumulation (Vol Ratio 1.6x)",
    "price_action_status": "Higher Highs & Higher Lows 3 Hari",
    "support_resistance": "Support MA20: Rp 1.450 | Resistance 30D: Rp 1.800"
  },
  "action_plan": {
    "stop_loss_price": 1450,
    "take_profit_price": 1800,
    "trailing_stop_price": 1550
  }
}
  `;

  const rawResult = await callPortfolioGemini(prompt);
  const cleanJson = rawResult.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleanJson);

  // Fallback default untuk KeyStats jika AI lupa/format kurang tepat
  const defaultKeyStats: KeyStats = {
    trend_status: currentClose >= ma20 ? 'Strong Uptrend (Di atas MA20)' : 'Downtrend / Below MA20',
    bandarmologi_status: bandarVolumeRatio10d > 1.2 ? 'Accumulation' : bandarVolumeRatio10d < 0.8 ? 'Distribution' : 'Neutral',
    price_action_status: isHigherHighs3D ? 'Higher Highs 3 Hari' : 'Konsolidasi',
    support_resistance: `Support MA20: Rp ${Math.round(ma20)} | Resis 30D: Rp ${Math.max(...highs)}`,
  };

  const finalResult: PortfolioAnalysisResult = {
    ticker: item.ticker,
    buy_price: item.buy_price,
    current_price: currentClose,
    floating_pl_pct: floatingPLPct,
    health_score: parsed.health_score ?? 70,
    action_recommendation: parsed.action_recommendation ?? 'HOLD',
    risk_level: parsed.risk_level ?? 'MEDIUM',
    key_reason: parsed.key_reason ?? 'Analisis teknikal & bandarmologi normal.',
    key_stats: {
      trend_status: parsed.key_stats?.trend_status ?? defaultKeyStats.trend_status,
      bandarmologi_status: parsed.key_stats?.bandarmologi_status ?? defaultKeyStats.bandarmologi_status,
      price_action_status: parsed.key_stats?.price_action_status ?? defaultKeyStats.price_action_status,
      support_resistance: parsed.key_stats?.support_resistance ?? defaultKeyStats.support_resistance,
    },
    action_plan: {
      stop_loss_price: parsed.action_plan?.stop_loss_price ?? Math.round(ma50 * 0.97),
      take_profit_price: parsed.action_plan?.take_profit_price ?? Math.round(currentClose * 1.10),
      trailing_stop_price: parsed.action_plan?.trailing_stop_price ?? Math.round(ma20),
    },
    fromCache: false,
  };

  // 4. SIMPAN HASIL ANALISIS KE TABEL portfolio_analysis_cache IN SUPABASE
  await supabase.from('portfolio_analysis_cache').upsert(
    {
      ticker: item.ticker,
      date: latestDate,
      buy_price: item.buy_price,
      current_price: currentClose,
      floating_pl_pct: floatingPLPct,
      health_score: finalResult.health_score,
      action_recommendation: finalResult.action_recommendation,
      risk_level: finalResult.risk_level,
      key_reason: finalResult.key_reason,
      key_stats: finalResult.key_stats, // Menyimpan JSON object key_stats
      action_plan: finalResult.action_plan,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'ticker,date,buy_price' }
  );

  return finalResult;
}

/**
 * Fungsi untuk mengambil semua cache portofolio sekaligus pada tanggal tertentu
 */
export async function fetchPortfolioCaches(date: string) {
  const { data } = await supabase
    .from('portfolio_analysis_cache')
    .select('*')
    .eq('date', date);

  return data || [];
}