import React, { useState } from 'react';
import { CsvUploader } from './components/CsvUploader';
import { StockScreener } from './components/StockScreener';
import { TrendingUp, UploadCloud, SlidersHorizontal } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'screener' | 'upload'>('screener');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-3 sm:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header App */}
        <header className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 sm:p-5 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 sm:p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 shrink-0">
                <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8" />
              </div>
              <div>
                <h1 className="text-base sm:text-2xl font-extrabold tracking-tight text-slate-100">
                  AI Stock Pullback <span className="text-emerald-400">Analyzer</span>
                </h1>
                <p className="text-[11px] sm:text-xs text-slate-400 line-clamp-1">
                  IHSG Screener Logika AFL & Technical AI Analysis
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Tabs (Mobile & Desktop Friendly) */}
          <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-700/60 mt-4">
            <button
              onClick={() => setActiveTab('screener')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'screener'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Screener Saham</span>
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'upload'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Import Data CSV</span>
            </button>
          </div>
        </header>

        {/* Dynamic Content Area */}
        <main>
          {activeTab === 'screener' ? (
            <StockScreener />
          ) : (
            <section className="bg-slate-800 border border-slate-700 rounded-xl p-4 sm:p-6 shadow-lg space-y-4">
              <div className="border-b border-slate-700 pb-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-emerald-400" /> Import Data Saham Harian
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Unggah file CSV harian OHLCV untuk memperbarui basis data saham di Supabase.
                </p>
              </div>
              
              <CsvUploader 
                onUploadSuccess={() => {
                  console.log('Upload berhasil!');
                  setActiveTab('screener'); // Otomatis balik ke tab screener setelah upload selesai
                }} 
              />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}