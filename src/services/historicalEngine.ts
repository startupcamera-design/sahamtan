import { supabase } from '../lib/supabase';

export interface HistoricalWinRateMatrix {
  scoreRangeWR: Record<string, number>;
  supertrendWR: Record<string, number>;
  actionWR: Record<string, number>;
  volumeTierWR: Record<string, number>;
  pennyWR: { penny: number; normal: number };
  totalEvaluated: number;
}

export interface CandidateWithWinRateScore {
  id: number;
  ticker: string;
  date: string;
  ai_score: number;
  action_recommendation: string;
  supertrend_status: string;
  volume_ratio: number;
  volume_tier: 'DRY_PULLBACK' | 'NORMAL_VOLUME' | 'HIGH_VOLUME_SURGE';
  trading_plan: any;
  analysis_text: string;
  historicalProbabilityScore: number;
  breakdownWR: {
    scoreWR: number;
    supertrendWR: number;
    actionWR: number;
    volumeWR: number;
    pennyWR: number;
  };
}

// Helper parser angka aman
const parseEntryPrice = (planInput: any): number => {
  if (!planInput) return 0;
  let plan = planInput;
  if (typeof planInput === 'string') {
    try {
      plan = JSON.parse(planInput);
    } catch {
      return 0;
    }
  }
  const entryStr = plan?.entry_area || '';
  const digits = entryStr.replace(/[^0-9.]/g, '');
  return parseFloat(digits) || 0;
};

// Helper Kategori Volume
export const getVolumeTier = (volume: number, avgVolume20: number): 'DRY_PULLBACK' | 'NORMAL_VOLUME' | 'HIGH_VOLUME_SURGE' => {
  if (!avgVolume20 || avgVolume20 <= 0) return 'NORMAL_VOLUME';
  const ratio = volume / avgVolume20;
  if (ratio < 0.8) return 'DRY_PULLBACK';
  if (ratio <= 1.5) return 'NORMAL_VOLUME';
  return 'HIGH_VOLUME_SURGE';
};

/**
 * TAHAP A: Hitung Matriks Win Rate Historis + DEBUG LOGS
 */
export async function getHistoricalWinRateMatrix(): Promise<HistoricalWinRateMatrix> {
  console.log('🔍 [DEBUG Engine] Start fetching historical evaluated data...');

  const { data: history, error } = await supabase
    .from('ai_analysis_cache')
    .select('id, ticker, ai_score, action_recommendation, supertrend_status, volume, avg_volume_20, trading_plan, result_status')
    .in('result_status', ['HIT_TP1', 'HIT_TP2', 'HIT_SL']);

  if (error) {
    console.error('❌ [DEBUG Engine] Error from Supabase:', error);
  }

  console.log(`📊 [DEBUG Engine] Total evaluated rows fetched: ${history?.length || 0}`);

  const defaultMatrix: HistoricalWinRateMatrix = {
    scoreRangeWR: {},
    supertrendWR: { green: 60, red: 30 },
    actionWR: {},
    volumeTierWR: { DRY_PULLBACK: 65, NORMAL_VOLUME: 55, HIGH_VOLUME_SURGE: 45 },
    pennyWR: { penny: 40, normal: 60 },
    totalEvaluated: 0,
  };

  if (!history || history.length === 0) {
    console.warn('⚠️ [DEBUG Engine] History data is EMPTY! Returning default fallback matrix.');
    return defaultMatrix;
  }

  // Contoh sampel baris pertama untuk diperiksa
  console.log('🔍 [DEBUG Engine] Sample 1st Row Data from Database:', history[0]);

  const scoreStats: Record<string, { win: number; total: number }> = {};
  const stStats: Record<string, { win: number; total: number }> = {
    green: { win: 0, total: 0 },
    red: { win: 0, total: 0 },
  };
  const actionStats: Record<string, { win: number; total: number }> = {};
  const volumeStats: Record<string, { win: number; total: number }> = {
    DRY_PULLBACK: { win: 0, total: 0 },
    NORMAL_VOLUME: { win: 0, total: 0 },
    HIGH_VOLUME_SURGE: { win: 0, total: 0 },
  };
  const pennyStats = { pennyWin: 0, pennyTotal: 0, normalWin: 0, normalTotal: 0 };

  history.forEach((row) => {
    const isWin = row.result_status === 'HIT_TP1' || row.result_status === 'HIT_TP2';

    // 1. Grouping Rentang Skor
    const numScore = Number(row.ai_score) || 0;
    const scoreFloor = Math.floor(numScore / 10) * 10;
    const scoreGroupKey = `${scoreFloor}-${scoreFloor + 9}`;
    
    if (!scoreStats[scoreGroupKey]) scoreStats[scoreGroupKey] = { win: 0, total: 0 };
    scoreStats[scoreGroupKey].total++;
    if (isWin) scoreStats[scoreGroupKey].win++;

    // 2. Grouping SuperTrend
    const stKey = (row.supertrend_status || 'red').toString().toLowerCase().trim();
    if (stStats[stKey]) {
      stStats[stKey].total++;
      if (isWin) stStats[stKey].win++;
    }

    // 3. Grouping Rekomendasi Aksi
    const actKey = (row.action_recommendation || 'UNKNOWN')
      .toString()
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    if (!actionStats[actKey]) actionStats[actKey] = { win: 0, total: 0 };
    actionStats[actKey].total++;
    if (isWin) actionStats[actKey].win++;

    // 4. Grouping Volume Tier
    const volTier = getVolumeTier(Number(row.volume) || 0, Number(row.avg_volume_20) || 0);
    if (volumeStats[volTier]) {
      volumeStats[volTier].total++;
      if (isWin) volumeStats[volTier].win++;
    }

    // 5. Grouping Price Tier
    const entryPrice = parseEntryPrice(row.trading_plan);
    if (entryPrice > 0 && entryPrice < 100) {
      pennyStats.pennyTotal++;
      if (isWin) pennyStats.pennyWin++;
    } else if (entryPrice >= 100) {
      pennyStats.normalTotal++;
      if (isWin) pennyStats.normalWin++;
    }
  });

  // Hitung % WR
  const matrix: HistoricalWinRateMatrix = {
    scoreRangeWR: {},
    supertrendWR: {
      green: stStats.green.total > 0 ? Math.round((stStats.green.win / stStats.green.total) * 100) : 60,
      red: stStats.red.total > 0 ? Math.round((stStats.red.win / stStats.red.total) * 100) : 30,
    },
    actionWR: {},
    volumeTierWR: {
      DRY_PULLBACK: volumeStats.DRY_PULLBACK.total > 0 ? Math.round((volumeStats.DRY_PULLBACK.win / volumeStats.DRY_PULLBACK.total) * 100) : 65,
      NORMAL_VOLUME: volumeStats.NORMAL_VOLUME.total > 0 ? Math.round((volumeStats.NORMAL_VOLUME.win / volumeStats.NORMAL_VOLUME.total) * 100) : 55,
      HIGH_VOLUME_SURGE: volumeStats.HIGH_VOLUME_SURGE.total > 0 ? Math.round((volumeStats.HIGH_VOLUME_SURGE.win / volumeStats.HIGH_VOLUME_SURGE.total) * 100) : 45,
    },
    pennyWR: {
      penny: pennyStats.pennyTotal > 0 ? Math.round((pennyStats.pennyWin / pennyStats.pennyTotal) * 100) : 40,
      normal: pennyStats.normalTotal > 0 ? Math.round((pennyStats.normalWin / pennyStats.normalTotal) * 100) : 60,
    },
    totalEvaluated: history.length,
  };

  Object.keys(scoreStats).forEach((key) => {
    const s = scoreStats[key];
    matrix.scoreRangeWR[key] = s.total > 0 ? Math.round((s.win / s.total) * 100) : 50;
  });

  Object.keys(actionStats).forEach((key) => {
    const a = actionStats[key];
    matrix.actionWR[key] = a.total > 0 ? Math.round((a.win / a.total) * 100) : 50;
  });

  console.log('📈 [DEBUG Engine] Matriks Akhir Score Range WR:', matrix.scoreRangeWR);
  console.log('📈 [DEBUG Engine] Matriks Akhir Action WR:', matrix.actionWR);

  return matrix;
}

/**
 * TAHAP B: Kalibrasi Saham PENDING + DEBUG LOGS
 */
export async function getTop10ByWinRateHistory(targetDate: string): Promise<CandidateWithWinRateScore[]> {
  const matrix = await getHistoricalWinRateMatrix();

  console.log(`🔍 [DEBUG Engine] Fetching PENDING candidates for date: ${targetDate}`);

  const { data: pendingCandidates, error } = await supabase
    .from('ai_analysis_cache')
    .select('*')
    .eq('date', targetDate)
    .eq('result_status', 'PENDING');

  if (error) console.error('❌ [DEBUG Engine] Error fetching pending candidates:', error);

  console.log(`📋 [DEBUG Engine] Total pending candidates found: ${pendingCandidates?.length || 0}`);

  if (!pendingCandidates || pendingCandidates.length === 0) {
    return [];
  }

  const evaluatedList: CandidateWithWinRateScore[] = pendingCandidates.map((stock) => {
    // 1. Score Group Key
    const rawScore = Number(stock.ai_score) || 0;
    const scoreFloor = Math.floor(rawScore / 10) * 10;
    const scoreGroupKey = `${scoreFloor}-${scoreFloor + 9}`;
    const scoreWR = matrix.scoreRangeWR[scoreGroupKey] ?? 50;

    // 2. SuperTrend
    const stKey = (stock.supertrend_status || 'red').toString().toLowerCase().trim();
    const supertrendWR = matrix.supertrendWR[stKey] ?? 30;

    // 3. Action
    const actKey = (stock.action_recommendation || 'UNKNOWN')
      .toString()
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    const actionWR = matrix.actionWR[actKey] ?? 50;

    // 4. Volume Ratio & Tier
    const vol = Number(stock.volume) || 0;
    const avgVol = Number(stock.avg_volume_20) || 1;
    const volRatio = avgVol > 0 ? Number((vol / avgVol).toFixed(2)) : 1;
    const volTier = getVolumeTier(vol, avgVol);
    const volumeWR = matrix.volumeTierWR[volTier] ?? 50;

    // 5. Penny Stock
    const entryPrice = parseEntryPrice(stock.trading_plan);
    const pennyWR = entryPrice > 0 && entryPrice < 100 ? matrix.pennyWR.penny : matrix.pennyWR.normal;

    // Log khusus untuk sampel BKSW atau kandidat pertama
    if (stock.ticker === 'BKSW' || stock === pendingCandidates[0]) {
      console.log(`🎯 [DEBUG Engine Target: ${stock.ticker}] Details:`, {
        ticker: stock.ticker,
        rawAiScore: rawScore,
        computedGroupKey: scoreGroupKey,
        scoreWRFoundInMatrix: scoreWR,
        rawActionStr: stock.action_recommendation,
        computedActKey: actKey,
        actionWRFoundInMatrix: actionWR,
        volRatio,
        volTier,
        volumeWR,
        pennyWR,
      });
    }

    const finalScore = Math.round(
      scoreWR * 0.30 +
      supertrendWR * 0.25 +
      actionWR * 0.20 +
      volumeWR * 0.15 +
      pennyWR * 0.10
    );

    return {
      id: stock.id,
      ticker: stock.ticker,
      date: stock.date,
      ai_score: stock.ai_score,
      action_recommendation: stock.action_recommendation,
      supertrend_status: stock.supertrend_status,
      volume_ratio: volRatio,
      volume_tier: volTier,
      trading_plan: stock.trading_plan,
      analysis_text: stock.analysis_text,
      historicalProbabilityScore: finalScore,
      breakdownWR: {
        scoreWR,
        supertrendWR,
        actionWR,
        volumeWR,
        pennyWR,
      },
    };
  });

  return evaluatedList
    .sort((a, b) => b.historicalProbabilityScore - a.historicalProbabilityScore)
    .slice(0, 10);
}