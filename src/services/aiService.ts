import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// DAFTAR MODEL GEMINI BERDASARKAN PRIORITAS (Fallback Chain)
// Jika model pertama limit/kuota habis (429), otomatis panggil model berikutnya.
const GEMINI_MODELS = [
  'gemini-3.6-flash', // Model Utama (Latest Fast Model)
  'gemini-3.5-flash', // Cadangan 1
  'gemini-3.0-flash', // Cadangan 2
];

export interface StockCandidate {
  ticker: string;
  last_date: string;
  close_price: number;
  ma50: number;
  dist_to_ma50_pct: number;
  volume: number;
  avg_volume_20: number;
}

export interface TradingPlan {
  status: string;
  entry_area: string;
  stop_loss: string;
  target_price_1: string;
  target_price_2: string;
  rr_ratio: string;
}

export interface AIAnalysisResult {
  score: number;
  action: string;
  tradingPlan: TradingPlan | null;
  analysisMarkdown: string;
  fromCache: boolean;
}

/**
  * Helper Function: Panggil Gemini API dengan mekanisme Fallback
  */
async function callGeminiAPI(prompt: string): Promise<string> {
  let lastError = '';

  for (const model of GEMINI_MODELS) {
    try {
      console.log(`🤖 Mencoba analisis menggunakan model: ${model}...`);

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
          }),
        }
      );

      const json = await response.json();

      if (!response.ok) {
        const errorMsg = json.error?.message || response.statusText;
        console.warn(`⚠️ Model ${model} gagal (${response.status}): ${errorMsg}`);
        lastError = errorMsg;

        // Jika error karena Limit/Quota Exceeded (HTTP 429 / 403 / 503), lanjut ke model berikutnya
        if ([429, 403, 503, 500].includes(response.status) || errorMsg.includes('quota') || errorMsg.includes('limit')) {
          console.log(`🔄 Mengalihkan ke model fallback berikutnya...`);
          continue;
        }

        throw new Error(errorMsg);
      }

      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error(`Respons dari model ${model} kosong.`);
      }

      console.log(`✅ Berhasil menggunakan model: ${model}`);
      return text;
    } catch (err: any) {
      console.warn(`⚠️ Gagal pada model ${model}:`, err.message || err);
      lastError = err.message || err;
    }
  }

  throw new Error(`Semua model Gemini mengalami limit/error. Pesan terakhir: ${lastError}`);
}

export async function analyzeStockWithAI(candidate: StockCandidate): Promise<AIAnalysisResult> {
  // 1. CEK CACHE SUPABASE: Apakah sudah pernah dianalisis pada tanggal ini?
  const { data: cachedData } = await supabase
    .from('ai_analysis_cache')
    .select('ai_score, action_recommendation, trading_plan, analysis_text')
    .eq('ticker', candidate.ticker)
    .eq('date', candidate.last_date)
    .maybeSingle();

  if (cachedData) {
    console.log(`⚡ Data ${candidate.ticker} dimuat dari Cache Supabase!`);
    return {
      score: cachedData.ai_score,
      action: cachedData.action_recommendation,
      tradingPlan: cachedData.trading_plan
        ? typeof cachedData.trading_plan === 'string'
          ? JSON.parse(cachedData.trading_plan)
          : cachedData.trading_plan
        : null,
      analysisMarkdown: cachedData.analysis_text,
      fromCache: true,
    };
  }

  // 2. JIKA BELUM ADA DI CACHE: Ambil 15 hari riwayat OHLCV dari Supabase
  const { data: history, error } = await supabase
    .from('daily_stock_prices')
    .select('date, open, high, low, close, volume')
    .eq('ticker', candidate.ticker)
    .order('date', { ascending: false })
    .limit(15);

  if (error || !history || history.length === 0) {
    throw new Error('Gagal mengambil data riwayat saham untuk analisis AI.');
  }

  const chronologicalHistory = [...history].reverse();

  // Hitung tren volume 3 hari terakhir
  const last3Volumes = chronologicalHistory.slice(-3).map((h) => Number(h.volume));
  const avg3Vol = last3Volumes.reduce((a, b) => a + b, 0) / last3Volumes.length;
  const isVolumeDryingUp = avg3Vol < Number(candidate.avg_volume_20);

  // 3. Susun Payload untuk AI
  const aiPayload = {
    ticker: candidate.ticker,
    analysis_date: candidate.last_date,
    current_metrics: {
      close_price: candidate.close_price,
      ma50: candidate.ma50,
      distance_to_ma50_pct: `${candidate.dist_to_ma50_pct}%`,
      current_volume: candidate.volume,
      avg_volume_20d: candidate.avg_volume_20,
      volume_trend: isVolumeDryingUp
        ? 'DRY_UP / CONTRACTION (Volume Mengecil - Sehat)'
        : 'EXPANSION (Volume Meningkat)',
    },
    last_15_days_ohlcv: chronologicalHistory.map((h) => ({
      date: h.date,
      open: Number(h.open),
      high: Number(h.high),
      low: Number(h.low),
      close: Number(h.close),
      volume: Number(h.volume),
    })),
  };

  const prompt = `
Anda adalah Senior Technical Analyst Saham Indonesia (IHSG) spesialis strategi "Pullback Trend Following".
Analisis data teknikal saham berikut:

${JSON.stringify(aiPayload, null, 2)}

WAJIB: Berikan jawaban dengan format diawali tag JSON berikut di baris paling atas untuk dibaca oleh sistem:
---JSON_SUMMARY---
{
  "score": 78,
  "action": "BUY ON SUPPORT",
  "trading_plan": {
    "status": "BUY ON SUPPORT",
    "entry_area": "4.000 – 4.040",
    "stop_loss": "3.950",
    "target_price_1": "4.110 – 4.140",
    "target_price_2": "4.250",
    "rr_ratio": "1 : 3.28"
  }
}
---END_JSON_SUMMARY---

Kemudian lanjutkan dengan Laporan Markdown lengkap dengan struktur:
1. **Evaluasi Kualitas Pullback (Skor 1 - 100)**: Evaluasi penurunan volume (Dry Up) dan posisi MA50.
2. **Karakteristik Aksi Harga (Price Action)**: Candlestick & Reversal Support.
3. **Rekomendasi Trading Plan**:
   - Status: (BUY ON SUPPORT / WAIT FOR CONFIRMATION / AVOID)
   - Area Entry: Rentang beli ideal.
   - Stop Loss (SL): Toleransi bawah.
   - Target Price (TP1 & TP2): Target kenaikan.
   - Risk to Reward Ratio: Rasio R:R.
4. **Catatan Risiko / Warning**.
  `;

  // 4. Panggil Gemini API dengan Fallback Mechanism
  const rawText = await callGeminiAPI(prompt);

  // 5. Ekstraksi JSON Summary (Skor, Action, & Trading Plan) dari respon AI
  let score = 75;
  let action = 'BUY ON SUPPORT';
  let tradingPlan: TradingPlan | null = null;

  const jsonMatch = rawText.match(/---JSON_SUMMARY---\s*({[\s\S]*?})\s*---END_JSON_SUMMARY---/);

  if (jsonMatch && jsonMatch[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      score = parsed.score ?? score;
      action = parsed.action ?? action;
      if (parsed.trading_plan) {
        tradingPlan = parsed.trading_plan;
      }
    } catch (e) {
      console.error('Error parsing JSON summary:', e);
    }
  }

  // Bersihkan teks Markdown dari tag JSON Summary
  const cleanMarkdown = rawText.replace(/---JSON_SUMMARY---[\s\S]*?---END_JSON_SUMMARY---/, '').trim();

  // 6. SIMPAN HASIL KE SUPABASE CACHE
  await supabase.from('ai_analysis_cache').upsert(
    {
      ticker: candidate.ticker,
      date: candidate.last_date,
      ai_score: score,
      action_recommendation: action,
      trading_plan: tradingPlan, // Disimpan sebagai JSONB
      analysis_text: cleanMarkdown,
    },
    { onConflict: 'ticker,date' }
  );

  return {
    score,
    action,
    tradingPlan,
    analysisMarkdown: cleanMarkdown,
    fromCache: false,
  };
}

// Fungsi bantu untuk mengambil semua cache AI tanggal bursa terbaru agar tampil di tabel awal
export async function fetchLatestAICaches(date: string) {
  const { data } = await supabase
    .from('ai_analysis_cache')
    .select('ticker, ai_score, action_recommendation, trading_plan, analysis_text')
    .eq('date', date);

  return data || [];
}