import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 1. KUMPULKAN KUMPULAN API KEY DARI ENV
const GEMINI_API_KEYS = [
  import.meta.env.VITE_GEMINI_API_KEY,
  import.meta.env.VITE_GEMINI_API_KEY_1,
  import.meta.env.VITE_GEMINI_API_KEY_2,
  import.meta.env.VITE_GEMINI_API_KEY_3,
].filter(Boolean); // Memfilter key yang tidak terisi/undefined

// 2. DAFTAR MODEL BERDASARKAN PRIORITAS
const GEMINI_MODELS = [
  'gemini-3.6-flash', // Model Utama
  'gemini-3.5-flash', // Cadangan Utama
  'gemini-3.0-flash', // Cadangan Akses Cepat
];

export type MarketRegime = 'BULLISH' | 'SIDEWAYS_BEARISH';

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
  usedModel?: string; // 👈 Ditambahkan agar bisa menampilkan model AI di modal screener
}

interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ==========================================
// HELPER CALCULATORS (4 PILAR PRE-PROCESSING)
// ==========================================

function calculateMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  const slice = data.slice(-period);
  const sum = slice.reduce((acc, val) => acc + val, 0);
  return Number((sum / period).toFixed(2));
}

function calculateATR(history: OHLCV[], period = 14): number {
  if (history.length < period + 1) return 0;

  const trValues: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const current = history[i];
    const prevClose = history[i - 1].close;

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prevClose),
      Math.abs(current.low - prevClose)
    );
    trValues.push(tr);
  }

  let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }

  return Number(atr.toFixed(2));
}

/**
 * 🏛️ PILAR 1: Tren & Struktur Support (MA50 Dynamics)
 */
function analyzePillar1Trend(history: OHLCV[], ma50Current: number) {
  if (history.length < 50) {
    return {
      ma50Slope10dPct: '0.0%',
      ma50SlopeStatus: 'NEUTRAL',
      proximityZone: 'NORMAL ZONE',
      daysAboveMA50: 0,
    };
  }

  const closes = history.map((h) => h.close);
  const len = closes.length;

  // Hitung MA50 10 hari lalu (Membutuhkan minimal 60 data historis)
  const ma5010dAgo = calculateMA(closes.slice(0, len - 10), 50);
  const ma50Slope10d = ma5010dAgo > 0 ? ((ma50Current - ma5010dAgo) / ma5010dAgo) * 100 : 0;

  const currentClose = closes[len - 1];
  const distToMA50Pct = ma50Current > 0 ? ((currentClose - ma50Current) / ma50Current) * 100 : 0;

  let ma50SlopeStatus = '🔴 DOWNTREND (Kemiringan Negatif)';
  if (ma50Slope10d > 1.5) ma50SlopeStatus = '🟢 UPTREND KUAT (> +1.5%)';
  else if (ma50Slope10d > 0) ma50SlopeStatus = '🟡 UPTREND MELANDAI (0% s/d +1.5%)';

  let proximityZone = '⚠️ MODERATE ZONE (4% - 6% dari MA50)';
  if (distToMA50Pct >= 0 && distToMA50Pct <= 4) {
    proximityZone = '🎯 SWEET ZONE (0% - 4% dari MA50 - Sangat Ideal)';
  } else if (distToMA50Pct > 6) {
    proximityZone = '🚨 FAR ZONE (> 6% dari MA50 - Overextended)';
  } else if (distToMA50Pct < 0) {
    proximityZone = '❌ BREAKDOWN ZONE (Harga di Bawah MA50)';
  }

  // Hitung berapa hari harga bertahan di atas MA50 dalam 20 hari terakhir secara presisi
  let daysAbove = 0;
  const recent20 = history.slice(-20);
  recent20.forEach((h, idx) => {
    const historicalSlice = closes.slice(0, len - 20 + idx + 1);
    if (historicalSlice.length >= 50) {
      const historicalMA50 = calculateMA(historicalSlice, 50);
      if (h.close >= historicalMA50) daysAbove++;
    } else {
      if (h.close >= ma50Current) daysAbove++;
    }
  });

  return {
    ma50Slope10dPct: `${ma50Slope10d >= 0 ? '+' : ''}${ma50Slope10d.toFixed(2)}%`,
    ma50SlopeStatus,
    proximityZone,
    daysAboveMA50: daysAbove,
  };
}

/**
 * 🌊 PILAR 2: Dinamika Volume & Aksi Bandar
 */
function analyzePillar2Volume(history: OHLCV[], avgVol20: number) {
  const last10 = history.slice(-10);
  const last3 = history.slice(-3);

  const avgVol3 = last3.reduce((acc, h) => acc + h.volume, 0) / 3;
  const vol3dRatioPct = Number(((avgVol3 / avgVol20) * 100).toFixed(1));

  const distributionDays = last10.filter((h) => h.close < h.open && h.volume > avgVol20 * 1.3).length;

  let upVolume = 0;
  let downVolume = 0;
  last10.forEach((h) => {
    if (h.close >= h.open) {
      upVolume += h.volume;
    } else {
      downVolume += h.volume;
    }
  });
  const upDownVolRatio = downVolume > 0 ? Number((upVolume / downVolume).toFixed(2)) : 2.0;

  let isVolumeDecliningOver3Days = false;
  if (history.length >= 4) {
    const v1 = history[history.length - 1].volume;
    const v2 = history[history.length - 2].volume;
    const v3 = history[history.length - 3].volume;
    isVolumeDecliningOver3Days = v1 <= v2 && v2 <= v3;
  }

  return {
    vol3dRatioPct,
    distributionDaysCount10d: distributionDays,
    upDownVolRatio,
    isVolumeDecliningOver3Days,
  };
}

/**
 * 🕯️ PILAR 3: Price Action, Candlestick Reversal & Volatilitas (VCP)
 */
function analyzePillar3PriceAction(history: OHLCV[]) {
  if (history.length < 20) {
    return {
      lastCandleType: 'NORMAL',
      reversalSignalDetected: 'BELUM ADA',
      vcpRatioPct: '100%',
      vcpStatus: 'NORMAL',
    };
  }

  const len = history.length;
  const curr = history[len - 1];
  const prev = history[len - 2];

  const body = Math.abs(curr.close - curr.open);
  const upperShadow = curr.high - Math.max(curr.close, curr.open);
  const lowerShadow = Math.min(curr.close, curr.open) - curr.low;
  const range = curr.high - curr.low;

  let candleType = 'NEUTRAL / NORMAL';
  let isReversal = false;

  // Bullish Hammer / Pinbar
  if (lowerShadow >= 2 * body && upperShadow <= body * 0.5 && range > 0) {
    candleType = 'BULLISH_HAMMER';
    isReversal = true;
  }
  // Bullish Engulfing
  else if (
    prev.close < prev.open &&
    curr.close > curr.open &&
    curr.close >= prev.open &&
    curr.open <= prev.close
  ) {
    candleType = 'BULLISH_ENGULFING';
    isReversal = true;
  }
  // Doji
  else if (body <= range * 0.1 && range > 0) {
    candleType = 'DOJI_INDECISION';
    isReversal = true;
  }

  // VCP Ratio = (Avg Range 3D / Avg Range 20D) * 100
  const last3Ranges = history.slice(-3).reduce((sum, h) => sum + (h.high - h.low), 0) / 3;
  const last20Ranges = history.slice(-20).reduce((sum, h) => sum + (h.high - h.low), 0) / 20;

  const vcpRatio = last20Ranges > 0 ? (last3Ranges / last20Ranges) * 100 : 100;

  let vcpStatus = '🔴 NORMAL / VOLATILE';
  if (vcpRatio <= 60) {
    vcpStatus = '🟢 HIGHLY COMPRESSED (< 60% - Pengeringan Volatilitas Sempurna)';
  } else if (vcpRatio <= 80) {
    vcpStatus = '🟡 MODERATE COMPRESSION (60% - 80%)';
  }

  return {
    lastCandleType: candleType,
    reversalSignalDetected: isReversal
      ? `YA (${candleType} terbentuk dekat Support)`
      : 'BELUM ADA (Masih Konsolidasi / Candle Netral)',
    vcpRatioPct: `${vcpRatio.toFixed(1)}%`,
    vcpStatus,
  };
}

/**
 * 🛡️ PILAR 4: SuperTrend, Resistance Gap & Risk/Reward
 */
function analyzePillar4RiskExecution(history: OHLCV[], ma50Value: number, atr14: number) {
  if (history.length < 20) {
    return {
      supertrendStatus: 'NEUTRAL',
      upsideToResistancePct: '0%',
      stopLossDistancePct: '0%',
      riskRewardRatio: '1 : 2.0',
      tradeFeasibility: 'NEUTRAL',
    };
  }

  const currentClose = history[history.length - 1].close;
  const last20 = history.slice(-20);
  const swingHigh20d = Math.max(...last20.map((h) => h.high));

  // Upside Ruang Kenaikan ke Resistance Lokal
  const upsidePct = currentClose > 0 ? ((swingHigh20d - currentClose) / currentClose) * 100 : 0;

  // Kalkulasi SuperTrend Sederhana (ATR 10, Multiplier 1.5)
  let supertrendIsBullish = true;
  const hl2 = (history[history.length - 1].high + history[history.length - 1].low) / 2;
  const lowerBand = hl2 - 1.5 * atr14;
  if (currentClose < lowerBand) {
    supertrendIsBullish = false;
  }

  // Estimasi Risk & Reward
  const slPrice = Math.round(Math.min(ma50Value, currentClose - 1.0 * atr14));
  const riskAmount = currentClose - slPrice;
  const rewardAmount = swingHigh20d - currentClose;

  const riskPct = currentClose > 0 ? ((currentClose - slPrice) / currentClose) * 100 : 0;
  const rrRatio = riskAmount > 0 ? (rewardAmount / riskAmount).toFixed(2) : '1.0';

  let feasibility = '🔴 POOR RISK/REWARD (Sangat Rawan Mentok / Risk Terlalu Besar)';
  if (parseFloat(rrRatio) >= 2.5 && upsidePct >= 5) {
    feasibility = '🟢 VERY HIGH (Sangat Layak Eksekusi - Space Kenaikan Melimpah)';
  } else if (parseFloat(rrRatio) >= 1.5) {
    feasibility = '🟡 ACCEPTABLE (Cukup Layak Eksekusi)';
  }

  return {
    supertrendStatus: supertrendIsBullish
      ? '🟢 BULLISH (Sinyal Buy Aktif / Garis di Bawah Candle)'
      : '🔴 BEARISH (Sinyal Sell Aktif / Garis di Atas Candle)',
    upsideToResistancePct: `+${upsidePct.toFixed(1)}%`,
    stopLossDistancePct: `-${riskPct.toFixed(1)}%`,
    riskRewardRatio: `1 : ${rrRatio}`,
    tradeFeasibility: feasibility,
  };
}

// ==========================================
// MARKET REGIME CHECKER (IHSG)
// ==========================================

export async function getIHSGMarketRegime(date: string): Promise<{ regime: MarketRegime; note: string }> {
  try {
    const { data: ihsgData } = await supabase
      .from('daily_stock_prices')
      .select('close')
      .or('ticker.eq.COMPOSITE,ticker.eq.^JKSE')
      .lte('date', date)
      .order('date', { ascending: false })
      .limit(50);

    if (!ihsgData || ihsgData.length < 50) {
      return { regime: 'BULLISH', note: 'Data IHSG terbatas, menggunakan parameter Normal' };
    }

    const closes = ihsgData.map((d) => Number(d.close)).reverse();
    const currentClose = closes[closes.length - 1];

    const ma20 = calculateMA(closes, 20);
    const ma50 = calculateMA(closes, 50);

    if (currentClose >= ma20 && ma20 >= ma50) {
      return { regime: 'BULLISH', note: 'IHSG Uptrend (Harga > MA20 > MA50). Toleransi normal.' };
    } else {
      return {
        regime: 'SIDEWAYS_BEARISH',
        note: 'IHSG Defensif/Bearish. AI wajib sangat selektif dan ketat pada Volume Dry-Up.',
      };
    }
  } catch (err) {
    console.warn('Gagal cek status IHSG, default ke BULLISH:', err);
    return { regime: 'BULLISH', note: 'Default Mode' };
  }
}

// ==========================================
// MATHEMATICAL GUARDRAIL (VALIDATOR)
// ==========================================

function validateAndFixTradingPlan(
  plan: TradingPlan | null,
  closePrice: number,
  atr14: number,
  ma50: number,
  swingHigh30d: number
): TradingPlan {
  const defaultSL = Math.round(Math.min(ma50, closePrice) - 1.0 * (atr14 || closePrice * 0.02));
  const defaultTP1 = Math.round(Math.max(swingHigh30d, closePrice + 2.0 * (atr14 || closePrice * 0.04)));
  const defaultTP2 = Math.round(defaultTP1 + 1.5 * (atr14 || closePrice * 0.03));

  if (!plan) {
    const risk = closePrice - defaultSL;
    const reward = defaultTP1 - closePrice;
    const rr = risk > 0 ? (reward / risk).toFixed(2) : '2.0';

    return {
      status: 'WAIT FOR CONFIRMATION',
      entry_area: `${closePrice}`,
      stop_loss: `${defaultSL}`,
      target_price_1: `${defaultTP1}`,
      target_price_2: `${defaultTP2}`,
      rr_ratio: `1 : ${rr}`,
    };
  }

  const parseNum = (str: string): number => {
    if (!str) return 0;
    let clean = str.trim().replace(/\.(\d{3})/g, '$1');
    const digitsOnly = clean.replace(/[^0-9]/g, '');
    return parseInt(digitsOnly, 10) || 0;
  };

  // Helper untuk mendapatkan harga Entry Rata-rata dari entry_area (misal "6150 - 6225" -> 6187.5)
  const getAverageEntryPrice = (entryAreaStr: string, defaultPrice: number): number => {
    if (!entryAreaStr) return defaultPrice;
    const matches = entryAreaStr.match(/\d[\d.]*/g);
    if (!matches || matches.length === 0) return defaultPrice;

    const prices = matches.map((p) => parseNum(p)).filter((p) => p > 0);
    if (prices.length === 1) return prices[0];
    if (prices.length >= 2) return (prices[0] + prices[1]) / 2; // Ambil nilai tengah kisaran
    return defaultPrice;
  };

  let sl = parseNum(plan.stop_loss);
  let tp1 = parseNum(plan.target_price_1);
  let tp2 = parseNum(plan.target_price_2);

  // Tentukan harga acuan entry (Gunakan titik tengah entry_area jika valid, jika tidak gunakan closePrice)
  const effectiveEntryPrice = getAverageEntryPrice(plan.entry_area, closePrice);

  if (sl <= 10 || sl >= effectiveEntryPrice || sl < effectiveEntryPrice * 0.5) {
    console.warn(`🚨 Guardrail Triggered: SL dari AI (${plan.stop_loss}) tidak valid. Diperbaiki ke ATR SL: ${defaultSL}`);
    sl = defaultSL;
  }

  if (tp1 <= effectiveEntryPrice) {
    console.warn(`🚨 Guardrail Triggered: TP1 dari AI (${plan.target_price_1}) tidak valid. Diperbaiki.`);
    tp1 = defaultTP1;
  }

  if (tp2 <= tp1) {
    tp2 = Math.round(tp1 + 1.5 * (atr14 || effectiveEntryPrice * 0.03));
  }

  // Hitung Risk & Reward berdasarkan Harga Entry Efektif (bukan Close Price saat antre di bawah)
  const risk = effectiveEntryPrice - sl;
  const reward = tp1 - effectiveEntryPrice;
  const calculatedRR = risk > 0 ? (reward / risk).toFixed(2) : '2.0';

  return {
    status: plan.status || 'BUY ON SUPPORT',
    entry_area: plan.entry_area || `${closePrice}`,
    stop_loss: `${Math.round(sl)}`,
    target_price_1: `${Math.round(tp1)}`,
    target_price_2: `${Math.round(tp2)}`,
    rr_ratio: `1 : ${calculatedRR}`,
  };
}

// ==========================================
// GEMINI API CALLER WITH FALLBACK CHAIN
// ==========================================

async function callGeminiAPI(
  prompt: string,
  onProgress?: (status: string) => void
): Promise<{ text: string; usedModel: string }> { // 👈 Diubah agar mengembalikan nama model
  let lastError = '';

  if (GEMINI_API_KEYS.length === 0) {
    throw new Error('Tidak ada VITE_GEMINI_API_KEY yang terdeteksi di file .env');
  }

  for (const model of GEMINI_MODELS) {
    for (let keyIndex = 0; keyIndex < GEMINI_API_KEYS.length; keyIndex++) {
      const apiKey = GEMINI_API_KEYS[keyIndex];
      const keyLabel = keyIndex === 0 ? 'Utama' : `Cadangan ${keyIndex}`;
      const statusMsg = `Model ${model.replace('gemini-', '')} (Key ${keyLabel})`;

      try {
        // Kirim status ke UI
        if (onProgress) onProgress(`${statusMsg}...`);
        console.log(`🤖 Coba analisis [Model: ${model}] dengan [API Key: ${keyLabel}]...`);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-goog-api-key': apiKey,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
              },
            }),
          }
        );

        const json = await response.json();

        if (!response.ok) {
          const errorMsg = json.error?.message || response.statusText;
          console.warn(`⚠️ [Model ${model}] & [Key ${keyLabel}] gagal (${response.status}): ${errorMsg}`);
          lastError = errorMsg;

          if (
            [429, 403, 503, 500].includes(response.status) ||
            errorMsg.toLowerCase().includes('quota') ||
            errorMsg.toLowerCase().includes('limit')
          ) {
            if (onProgress) onProgress(`Limit pada ${statusMsg}, beralih...`);
            continue;
          }

          throw new Error(errorMsg);
        }

        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error(`Respons dari model ${model} kosong.`);

        return { text, usedModel: model }; // 👈 Kembalikan teks beserta nama model yang berhasil
      } catch (err: any) {
        console.warn(`⚠️ Terjadi kesalahan pada [Model ${model}] - [Key ${keyLabel}]:`, err.message || err);
        lastError = err.message || err;
      }
    }
  }

  throw new Error(`Seluruh kombinasi API Key & Model Gemini telah habis/limit. Pesan terakhir: ${lastError}`);
}

// ==========================================
// MAIN FUNCTION: ANALYZE STOCK WITH AI (4 PILARS)
// ==========================================

export async function analyzeStockWithAI(
  candidate: StockCandidate,
  onProgress?: (statusText: string) => void
): Promise<AIAnalysisResult> {
  // 1. CEK CACHE SUPABASE
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
      usedModel: 'Supabase Cache', // 👈 Diberi tanda jika memuat dari cache
    };
  }

  // UPDATE STATUS STATUS LOADING JIKA PROGRESS CALLBACK ADA
  if (onProgress) onProgress('Mengecek IHSG & Mengambil Data...');

  // 2. CEK KONDISI PASAR IHSG
  const ihsgInfo = await getIHSGMarketRegime(candidate.last_date);

  // 3. AMBIL DATA RIWAYAT 75 HARI OHLCV (Naik dari 50 ke 75 agar kalkulasi MA50 20d lalu presisi)
  const { data: history, error } = await supabase
    .from('daily_stock_prices')
    .select('date, open, high, low, close, volume')
    .eq('ticker', candidate.ticker)
    .order('date', { ascending: false })
    .limit(75);

  if (error || !history || history.length === 0) {
    throw new Error('Gagal mengambil data riwayat saham untuk analisis AI.');
  }

  const chronologicalHistory: OHLCV[] = history
    .map((h) => ({
      date: h.date,
      open: Number(h.open),
      high: Number(h.high),
      low: Number(h.low),
      close: Number(h.close),
      volume: Number(h.volume),
    }))
    .reverse();

  // === PRE-PROCESSING INDIKATOR & KALKULASI 4 PILAR ===
  if (onProgress) onProgress('Menghitung 4 Pilar & Indikator...');

  const closePrices = chronologicalHistory.map((h) => h.close);

  const ma20 = calculateMA(closePrices, 20);
  const ma50 = candidate.ma50 || calculateMA(closePrices, 50);
  const atr14 = calculateATR(chronologicalHistory, 14);

  const last30Days = chronologicalHistory.slice(-30);
  const swingHigh30d = Math.max(...last30Days.map((h) => h.high));
  const swingLow30d = Math.min(...last30Days.map((h) => h.low));

  const currentVol = candidate.volume;
  const avgVol20 = candidate.avg_volume_20 || calculateMA(chronologicalHistory.map((h) => h.volume), 20);
  const volumeRatioPct = Number(((currentVol / avgVol20) * 100).toFixed(1));

  // KALKULASI 4 PILAR LOKAL
  const pillar1Data = analyzePillar1Trend(chronologicalHistory, ma50);
  const pillar2Data = analyzePillar2Volume(chronologicalHistory, avgVol20);
  const pillar3Data = analyzePillar3PriceAction(chronologicalHistory);
  const pillar4Data = analyzePillar4RiskExecution(chronologicalHistory, ma50, atr14);

  // 4. SUSUN RICH PAYLOAD UNTUK GEMINI AI
  const aiPayload = {
    ticker: candidate.ticker,
    analysis_date: candidate.last_date,
    market_context: {
      ihsg_regime: ihsgInfo.regime,
      ihsg_note: ihsgInfo.note,
    },
    pillar_1_trend_structure: {
      ma50_slope_10d_pct: pillar1Data.ma50Slope10dPct,
      ma50_slope_status: pillar1Data.ma50SlopeStatus,
      dist_to_ma50_pct: `${candidate.dist_to_ma50_pct}%`,
      proximity_zone: pillar1Data.proximityZone,
      days_above_ma50_in_20d: pillar1Data.daysAboveMA50,
    },
    pillar_2_volume_flow: {
      current_volume: currentVol,
      avg_volume_20d: avgVol20,
      volume_1d_vs_avg_pct: `${volumeRatioPct}%`,
      volume_3d_avg_vs_20d_avg_pct: `${pillar2Data.vol3dRatioPct}%`,
      is_volume_declining_3d_straight: pillar2Data.isVolumeDecliningOver3Days
        ? 'YA (Volume konsisten mengering 3 hari berturut-turut)'
        : 'TIDAK (Volume bervariasi)',
      distribution_days_count_10d: `${pillar2Data.distributionDaysCount10d} hari (Candle merah dengan Vol > 130% avg)`,
      up_down_volume_ratio_10d: pillar2Data.upDownVolRatio,
    },
    pillar_3_price_action: {
      last_candle_type: pillar3Data.lastCandleType,
      reversal_signal_detected: pillar3Data.reversalSignalDetected,
      vcp_volatility_compression_pct: pillar3Data.vcpRatioPct,
      vcp_status: pillar3Data.vcpStatus,
    },
    pillar_4_risk_reward_execution: {
      supertrend_status: pillar4Data.supertrendStatus,
      upside_to_swing_high_pct: pillar4Data.upsideToResistancePct,
      stop_loss_distance_pct: pillar4Data.stopLossDistancePct,
      risk_reward_ratio: pillar4Data.riskRewardRatio,
      trade_feasibility: pillar4Data.tradeFeasibility,
    },
    last_15_days_ohlcv: chronologicalHistory.slice(-15),
  };

  const marketInstruction =
    ihsgInfo.regime === 'SIDEWAYS_BEARISH'
      ? `⚠️ PASAR IHSG SEDANG WEAK/BEARISH: Berikan penalti skor 10-15 poin jika Volume Dry-Up tidak < 60% atau ada hari distribusi. Berikan TP yang defensif.`
      : `✅ PASAR IHSG BULLISH: Optimalkan target kenaikan jika 4 Pilar menunjukkan sinyal konfirmasi yang solid.`;

  // 5. PROMPT GEMINI AI DENGAN RUBRIK 4 PILAR (TOTAL 100 POIN)
  const prompt = `
Anda adalah Senior Technical Analyst Saham Indonesia (IHSG) yang sangat disiplin menggunakan strategi "Pullback Sehat & Swing Trading".
Analisis data teknikal 4 Pilar berikut secara teliti:

${JSON.stringify(aiPayload, null, 2)}

---
### 🚦 KONDISI MACRO IHSG SAAT INI:
${marketInstruction}

---
### 📐 RUBRIK PENILAIAN SKOR 4 PILAR (TOTAL MAKSIMAL 100 POIN) - GRADUAL CREDIT:
Evaluasi dan hitung skor secara akurat & objektif berdasarkan penyesuaian bertingkat berikut:

1. **PILAR 1: Tren & Struktur Support MA50 (Maks 25 Poin)**
   - **MA50 Slope (Kemiringan Tren):**
     * "UPTREND KUAT" (> +1.5%) = 15 Poin
     * "UPTREND MELANDAI" (0% s/d +1.5%) = 11 Poin
     * "DOWNTREND" (< 0%) = 0 Poin (Merusak Struktur Tren)
   - **Proximity Zone (Jarak ke MA50):**
     * "SWEET ZONE" (0% - 4% dari MA50) = 10 Poin (Zona Beli Ideal)
     * "MODERATE ZONE" (4% - 6% dari MA50) = 7 Poin
     * "FAR ZONE / BREAKDOWN" (> 6% atau di bawah MA50) = 0 Poin

2. **PILAR 2: Dinamika Volume & Aksi Bandar (Maks 25 Poin)**
   - **Volume Dry-Up & Distribusi:**
     * Volume < 65% DENGAN 0 Hari Distribusi = 25 Poin (Pullback Sempurna)
     * Volume < 75% DENGAN 1 Hari Distribusi = 20 Poin (Pullback Sehat)
     * Volume < 80% DENGAN 2 Hari Distribusi = 14 Poin (Konsolidasi Normal)
     * Volume > 100% ATAU Hari Distribusi >= 3 Hari = 5 Poin (Risiko Distribusi Besar)

3. **PILAR 3: Price Action & Reversal Candlestick (Maks 25 Poin)**
   - **Reversal Signal (Tanda Pantulan Support):**
     * Terdeteksi Signal Reversal Jelas ("YA" - Hammer / Engulfing / Doji) = 15 Poin
     * Tidak Ada Reversal Jelas TAPI Harga Bertahan Konsisten di Atas MA20/MA50 = 9 Poin (Base Building)
     * Candle Breakdown / Marubozu Merah = 0 Poin
   - **VCP Volatility Compression (Pengeringan Volatilitas):**
     * "HIGHLY COMPRESSED" (< 60%) = 10 Poin (Siap Breakout)
     * "MODERATE COMPRESSION" (60% - 80%) = 6 Poin
     * "NORMAL / VOLATILE" (> 80%) = 2 Poin

4. **PILAR 4: SuperTrend & Risk/Reward Ratio (Maks 25 Poin)**
   - **SuperTrend Status:**
     * "BULLISH" (Garis Hijau di bawah harga) = 10 Poin
     * "BEARISH TAPI DEKAT SUPPORT MA50" (Garis Merah tipis/mepet dekat candle) = 5 Poin (Peluang Early Entry)
     * "BEARISH JAUH / DOWNTREND" = 0 Poin
   - **Upside to Swing High (Ruang Kenaikan):**
     * Upside >= 6% = 5 Poin
     * Upside 3% - 5.9% = 3 Poin
     * Upside < 3% = 0 Poin (Ruang Sempit)
   - **Risk to Reward Ratio (R:R):**
     * R:R Ratio >= 1 : 2.5 = 10 Poin
     * R:R Ratio 1 : 1.8 s/d 1 : 2.49 = 6 Poin
     * R:R Ratio < 1 : 1.8 = 2 Poin

---
### 🏷️ KLASIFIKASI KEPUTUSAN AKHIR:
- Total Skor 85 - 100 : "STRONG BUY" / "SUPERIOR PULLBACK"
- Total Skor 72 - 84  : "BUY ON SUPPORT" / "GOOD PULLBACK"
- Total Skor 55 - 71  : "WAIT FOR CONFIRMATION" / "WATCHLIST"
- Total Skor < 55     : "AVOID" / "HIGH RISK"

---
### ⚙️ ATURAN FORMULA TRADING PLAN:
1. **Stop Loss (SL)**: Dipasang di bawah MA50 atau Swing Low 30D (dikurangi 0.5 - 1.0 x ATR14). Berupa angka murni tanpa titik (Contoh: "3910").
2. **Target Price 1 (TP1)**: Target area Swing High lokal terdekat. Angka murni tanpa titik.
3. **Target Price 2 (TP2)**: Target kenaikan lanjutan (TP1 + 1.5 x ATR14). Angka murni tanpa titik.

---
WAJIB: Awali respons Anda dengan tag JSON ringkasan di baris paling atas tanpa teks pembuka sebelum tag:

---JSON_SUMMARY---
{
  "score": 78,
  "action": "BUY ON SUPPORT",
  "trading_plan": {
    "status": "BUY ON SUPPORT",
    "entry_area": "4000 - 4040",
    "stop_loss": "3910",
    "target_price_1": "4180",
    "target_price_2": "4300",
    "rr_ratio": "1 : 2.8"
  }
}
---END_JSON_SUMMARY---

Kemudian lanjutkan dengan Laporan Analisis Markdown profesional dengan struktur:
1. **Rincian Evaluasi 4 Pilar (Breakdown Tabel Skor)**:
   | Pilar | Fokus Analisis | Kondisi Data | Skor Maks | Skor Diperoleh |
   | --- | --- | --- | --- | --- |
   | Pilar 1 | Tren & Struktur Support | ... | 25 | ... |
   | Pilar 2 | Dinamika Volume & Bandar | ... | 25 | ... |
   | Pilar 3 | Price Action & VCP | ... | 25 | ... |
   | Pilar 4 | SuperTrend & Risk/Reward | ... | 25 | ... |
   | **TOTAL** | **Skor Akhir Kombinasi** | ... | **100** | **...** |

2. **Analisis Mendalam Tren & Struktur Support (Pilar 1)**
3. **Analisis Dinamika Volume & Pengeringan Tekanan Jual (Pilar 2)**
4. **Evaluasi Formasi Candle & Kompresi Volatilitas / VCP (Pilar 3)**
5. **Rencana Eksekusi Trading & Risk/Reward (Pilar 4)**
6. **Catatan Peringatan Risiko / Red Flags** (Gunakan format Blockquote \`>\`)
  `;

  // 6. EKSEKUSI PANGGILAN GEMINI API (DENGAN MENERUSKAN ONPROGRESS)
  const { text: rawText, usedModel } = await callGeminiAPI(prompt, onProgress); // 👈 Menangkap result { text, usedModel }

  if (onProgress) onProgress('Memproses & Mengvalidasi Hasil...');

  // 7. EKSTRAKSI RINGKASAN JSON
  let score = 70;
  let action = 'WAIT FOR CONFIRMATION';
  let rawTradingPlan: TradingPlan | null = null;

  const jsonMatch = rawText.match(/---JSON_SUMMARY---\s*({[\s\S]*?})\s*---END_JSON_SUMMARY---/);

  if (jsonMatch && jsonMatch[1]) {
    try {
      // Pembersihan format markdown ```json jika diselipkan oleh AI
      const cleanJsonString = jsonMatch[1].replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJsonString);
      score = parsed.score ?? score;
      action = parsed.action ?? action;
      if (parsed.trading_plan) {
        rawTradingPlan = parsed.trading_plan;
      }
    } catch (e) {
      console.error('Error parsing JSON summary from Gemini:', e);
    }
  }

  // 8. JALANKAN GUARDRAIL / VALIDATOR MATEMATIS
  const validatedTradingPlan = validateAndFixTradingPlan(
    rawTradingPlan,
    candidate.close_price,
    atr14,
    ma50,
    swingHigh30d
  );

  const cleanMarkdown = rawText.replace(/---JSON_SUMMARY---[\s\S]*?---END_JSON_SUMMARY---/, '').trim();

  // 9. SIMPAN HASIL KE SUPABASE CACHE
  await supabase.from('ai_analysis_cache').upsert(
    {
      ticker: candidate.ticker,
      date: candidate.last_date,
      ai_score: score,
      action_recommendation: action,
      trading_plan: validatedTradingPlan,
      analysis_text: cleanMarkdown,
    },
    { onConflict: 'ticker,date' }
  );

  return {
    score,
    action,
    tradingPlan: validatedTradingPlan,
    analysisMarkdown: cleanMarkdown,
    fromCache: false,
    usedModel, // 👈 Meneruskan model AI yang merespons
  };
}

export async function fetchLatestAICaches(date: string) {
  const { data } = await supabase
    .from('ai_analysis_cache')
    .select('ticker, ai_score, action_recommendation, trading_plan, analysis_text')
    .eq('date', date);

  return data || [];
}