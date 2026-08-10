import React, { useState } from 'react';
import { CsvUploader } from './components/CsvUploader';
import { StockScreener } from './components/StockScreener';
import { AIWinRateBadge } from './components/AIWinRateBadge';
import { PortfolioAnalyzer } from './components/PortfolioAnalyzer';
import { 
  TrendingUp, 
  UploadCloud, 
  SlidersHorizontal, 
  Briefcase, 
  Sparkles,
  Zap,
  CheckCircle2
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'screener' | 'portfolio' | 'upload'>('screener');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 md:pb-8">
      {/* Container Utama */}
      <div className="max-w-full mx-auto px-3 sm:px-6 pt-3 sm:pt-6 space-y-4 sm:space-y-6">
        
        {/* ================= HEADER UTAMA ================= */}
        <header className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            
            {/* Logo & Judul Aplikasi */}
            <div className="flex items-center space-x-3">
              <div className="p-2 sm:p-2.5 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 shrink-0 shadow-inner">
                <TrendingUp className="w-5 h-5 sm:w-7 sm:h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-2xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
                    AI Stock <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">Pullback</span>
                  </h1>
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Zap className="w-3 h-3 mr-1 fill-emerald-400" /> Pro v2.5
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 line-clamp-1">
                  Screener AFL Amibroker & Analisis Portofolio AI 4 Pilar
                </p>
              </div>
            </div>

            {/* Status Server / Egress Shield Indicator (Desktop) */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Data & AI Cache Active</span>
            </div>
          </div>

          {/* Navigasi Desktop (Hanya muncul di layar Sedang & Besar) */}
          <nav className="hidden md:flex bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/80 mt-4">
            <button
              onClick={() => setActiveTab('screener')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === 'screener'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Screener Saham</span>
            </button>

            <button
              onClick={() => setActiveTab('portfolio')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === 'portfolio'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Briefcase className="w-4 h-4 text-indigo-300" />
              <span className="flex items-center gap-1.5">
                Portofolio AI <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              </span>
            </button>

            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === 'upload'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Import Data CSV</span>
            </button>
          </nav>
        </header>

        {/* ================= KONTEN UTAMA ================= */}
        <main className="space-y-4">
          {activeTab === 'screener' && (
            <div className="space-y-4 transition-all duration-300">
              {/* 1. Stat / Win Rate Badge */}
              <AIWinRateBadge />

              {/* 2. Main Screener Component */}
              <StockScreener />
            </div>
          )}

          {activeTab === 'portfolio' && (
            <div className="transition-all duration-300">
              <PortfolioAnalyzer />
            </div>
          )}

          {activeTab === 'upload' && (
            <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-emerald-400" /> Import Data Saham Harian (Multi-File)
                </h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Unggah file CSV harian OHLCV untuk memperbarui basis data Supabase. Aplikasi otomatis memproses secara bertahap (*batching*) agar hemat kuota egress & tidak memicu limit API.
                </p>
              </div>

              <CsvUploader 
                onUploadSuccess={() => {
                  setActiveTab('screener');
                }} 
              />
            </section>
          )}
        </main>

      </div>

      {/* ================= MOBILE BOTTOM NAVIGATION BAR (KHUSUS HP) ================= */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-3 py-2 shadow-2xl">
        <div className="flex items-center justify-around">
          
          {/* Nav Item: Screener */}
          <button
            onClick={() => setActiveTab('screener')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              activeTab === 'screener'
                ? 'text-emerald-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5" />
            <span className="text-[10px]">Screener</span>
          </button>

          {/* Nav Item: Portfolio */}
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all relative ${
              activeTab === 'portfolio'
                ? 'text-indigo-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Briefcase className="w-5 h-5" />
              <Sparkles className="w-2.5 h-2.5 text-amber-300 fill-amber-300 absolute -top-1 -right-1" />
            </div>
            <span className="text-[10px]">Portofolio</span>
          </button>

          {/* Nav Item: Upload */}
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              activeTab === 'upload'
                ? 'text-emerald-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-5 h-5" />
            <span className="text-[10px]">Import CSV</span>
          </button>

        </div>
      </div>
    </div>
  );
}