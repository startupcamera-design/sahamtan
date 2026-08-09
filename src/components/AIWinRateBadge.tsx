import React, { useEffect, useState } from 'react';
import { getAIWinRateStats, evaluateAIPerformance, type WinRateStats } from '../services/aiBacktestService';
import { Award, RefreshCw, TrendingUp } from 'lucide-react';

export const AIWinRateBadge: React.FC = () => {
  const [stats, setStats] = useState<WinRateStats | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    await evaluateAIPerformance(); // Run evaluator
    const data = await getAIWinRateStats();
    setStats(data);
    setLoading(false);
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (!stats) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between text-white shadow-lg my-4">
      <div className="flex items-center space-x-3">
        <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
          <Award className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs text-slate-400 font-medium">Akurasi Rencana Trading AI</div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-emerald-400">{stats.winRatePct}%</span>
            <span className="text-xs text-slate-400">Win Rate (TP Hit)</span>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-4 text-xs">
        <div className="text-center px-2">
          <span className="block text-emerald-400 font-bold">{stats.hitTP1 + stats.hitTP2}</span>
          <span className="text-slate-500">Hit TP</span>
        </div>
        <div className="text-center px-2 border-l border-slate-800">
          <span className="block text-rose-400 font-bold">{stats.hitSL}</span>
          <span className="text-slate-500">Hit SL</span>
        </div>
        <button
          onClick={loadStats}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-white transition-colors"
          title="Refresh Evaluasi"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};