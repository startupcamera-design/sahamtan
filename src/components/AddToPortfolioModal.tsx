import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Wallet, CheckCircle2, Loader2 } from 'lucide-react';

interface AddToPortfolioModalProps {
  ticker: string;
  defaultPrice?: number;
  defaultSL?: number;
  defaultTP1?: number;
  defaultTP2?: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AddToPortfolioModal: React.FC<AddToPortfolioModalProps> = ({
  ticker,
  defaultPrice = 0,
  defaultSL = 0,
  defaultTP1 = 0,
  defaultTP2 = 0,
  onClose,
  onSuccess,
}) => {
  const [buyPrice, setBuyPrice] = useState<number | string>(defaultPrice || '');
  const [lots, setLots] = useState<number | string>(1);
  const [stopLoss, setStopLoss] = useState<number | string>(defaultSL || '');
  const [tp1, setTp1] = useState<number | string>(defaultTP1 || '');
  const [tp2, setTp2] = useState<number | string>(defaultTP2 || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyPrice || !lots) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('user_portfolio').insert([
        {
          ticker: ticker.toUpperCase().trim(),
          buy_price: Number(buyPrice),
          lots: Number(lots),
          stop_loss: stopLoss ? Number(stopLoss) : null,
          target_price_1: tp1 ? Number(tp1) : null,
          target_price_2: tp2 ? Number(tp2) : null,
        },
      ]);

      if (error) throw error;

      alert(`✅ ${ticker} berhasil ditambahkan ke Portofolio!`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      alert(`⚠️ Gagal menyimpan ke portofolio: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden text-slate-200">
        
        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base text-white">
              Tambah Posisi: <span className="text-emerald-400">{ticker}</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Harga Beli (Avg) <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                placeholder="misal: 52"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Jumlah Lot <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                value={lots}
                onChange={(e) => setLots(e.target.value)}
                placeholder="misal: 10"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
          </div>

          <hr className="border-slate-800" />

          {/* Area Target SL & TP (Terisi Otomatis Dari AI, Bisa Diubah) */}
          <div className="space-y-2.5">
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Target Trading Plan (Tersimpan)
            </span>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-rose-400 font-bold mb-1">Stop Loss (SL)</label>
                <input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="SL"
                  className="w-full bg-slate-950 border border-rose-950/60 rounded-xl px-2.5 py-1.5 text-rose-300 font-bold text-xs focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-[10px] text-sky-400 font-bold mb-1">Target 1 (TP1)</label>
                <input
                  type="number"
                  value={tp1}
                  onChange={(e) => setTp1(e.target.value)}
                  placeholder="TP1"
                  className="w-full bg-slate-950 border border-sky-950/60 rounded-xl px-2.5 py-1.5 text-sky-300 font-bold text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[10px] text-teal-400 font-bold mb-1">Target 2 (TP2)</label>
                <input
                  type="number"
                  value={tp2}
                  onChange={(e) => setTp2(e.target.value)}
                  placeholder="TP2"
                  className="w-full bg-slate-950 border border-teal-950/60 rounded-xl px-2.5 py-1.5 text-teal-300 font-bold text-xs focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-950/50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Simpan ke Portofolio</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};