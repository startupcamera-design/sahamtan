import type { StockPriceData } from '../types/stock';

export interface ScreenerParams {
  lookbackDays: number; // Default: 7
  maxDistPct: number;   // Default: 0.08 (8%)
  minVolume: number;    // Default: 200000
}

export interface ScreenerResult {
  ticker: string;
  lastDate: string;
  closePrice: number;
  ma50: number;
  distToMA50Pct: number;
  volume: number;
  avgVolume20: number;
  isPullbackHealthy: boolean;
}

export function runPullbackScreener(
  prices: StockPriceData[],
  params: ScreenerParams = { lookbackDays: 7, maxDistPct: 0.08, minVolume: 200000 }
): ScreenerResult | null {
  // Urutkan data berdasarkan tanggal ascending (lama -> baru)
  const sorted = [...prices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Butuh minimal 50 + lookbackDays baris data untuk hitung MA50 & MA20 Volume
  if (sorted.length < 50 + params.lookbackDays) {
    return null;
  }

  const n = sorted.length;
  const latestIndex = n - 1;
  const latestRow = sorted[latestIndex];

  // 1. Hitung MA50 Hari Ini & Kemarin
  const ma50Today = sorted.slice(n - 50).reduce((acc, row) => acc + row.close, 0) / 50;
  const ma50Yesterday = sorted.slice(n - 51, n - 1).reduce((acc, row) => acc + row.close, 0) / 50;

  // MA50 Slope (Trend Naik)
  const ma50Up = ma50Today > ma50Yesterday;

  // 2. Filter AboveMA50: Selama lookbackDays, Close selalu > MA50
  let aboveMA50 = true;
  for (let i = 0; i < params.lookbackDays; i++) {
    const idx = latestIndex - i;
    const subSet50 = sorted.slice(idx - 49, idx + 1);
    const ma50AtIdx = subSet50.reduce((acc, row) => acc + row.close, 0) / 50;

    if (sorted[idx].close <= ma50AtIdx) {
      aboveMA50 = false;
      break;
    }
  }

  // 3. Jarak ke MA50 saat ini (%)
  const distToMA50 = (latestRow.close - ma50Today) / ma50Today;

  // Jarak N hari yang lalu
  const oldIdx = latestIndex - params.lookbackDays;
  const oldSet50 = sorted.slice(oldIdx - 49, oldIdx + 1);
  const ma50Old = oldSet50.reduce((acc, row) => acc + row.close, 0) / 50;
  const distToMA50Old = (sorted[oldIdx].close - ma50Old) / ma50Old;

  // GettingCloser: Harga makin mendekati MA50 (jarak makin kecil dibanding N hari lalu)
  const gettingCloser = distToMA50Old - distToMA50 > 0;

  // NotTooFar: Jarak ke MA50 tidak boleh melebih maxDistPct (e.g. 8%)
  const notTooFar = distToMA50 < params.maxDistPct;

  // 4. Volume Filter
  const avgVolume20 = sorted.slice(n - 20).reduce((acc, row) => acc + row.volume, 0) / 20;
  const volumeOK = latestRow.volume > params.minVolume && avgVolume20 > params.minVolume;

  // Final Condition
  const isPullbackHealthy = aboveMA50 && gettingCloser && notTooFar && ma50Up && volumeOK;

  return {
    ticker: latestRow.ticker,
    lastDate: latestRow.date,
    closePrice: latestRow.close,
    ma50: Math.round(ma50Today),
    distToMA50Pct: parseFloat((distToMA50 * 100).toFixed(2)),
    volume: latestRow.volume,
    avgVolume20: Math.round(avgVolume20),
    isPullbackHealthy,
  };
}