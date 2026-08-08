import React, { useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import type { StockCsvRow, StockPriceData } from '../types/stock';
import { Upload, CheckCircle2, AlertCircle, Loader2, Files } from 'lucide-react';

export const CsvUploader: React.FC<{ onUploadSuccess?: () => void }> = ({ onUploadSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Helper fungsi untuk parse 1 file CSV menjadi Promise
  const parseSingleCsv = (file: File): Promise<StockPriceData[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse<StockCsvRow>(file, {
        header: true,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          try {
            const parsedRows = results.data;
            if (!parsedRows || parsedRows.length === 0) {
              resolve([]);
              return;
            }

            const formattedData: StockPriceData[] = [];

            for (let i = 0; i < parsedRows.length; i++) {
              const row = parsedRows[i];

              if (!row.Ticker || !row['Date/Time']) continue;

              const ticker = row.Ticker.trim().toUpperCase();
              const rawDateStr = row['Date/Time'].toString().trim();

              const dateOnlyStr = rawDateStr.split(' ')[0];
              const dateParts = dateOnlyStr.includes('/')
                ? dateOnlyStr.split('/')
                : dateOnlyStr.split('-');

              if (dateParts.length !== 3) continue;

              const day = dateParts[0].padStart(2, '0');
              const month = dateParts[1].padStart(2, '0');
              let year = dateParts[2];
              if (year.length === 2) year = `20${year}`;

              const formattedDate = `${year}-${month}-${day}`;

              formattedData.push({
                ticker,
                date: formattedDate,
                open: parseFloat(row.Open || '0'),
                high: parseFloat(row.High || '0'),
                low: parseFloat(row.Low || '0'),
                close: parseFloat(row.Close || '0'),
                volume: parseFloat(row['Volume(Unit)'] || '0'),
              });
            }

            resolve(formattedData);
          } catch (err) {
            reject(err);
          }
        },
        error: (error) => reject(error),
      });
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setStatusMessage(null);

    try {
      const allStockData: StockPriceData[] = [];
      const totalFiles = files.length;

      // 1. Loop dan membaca semua file CSV yang di-upload
      for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        setProgressText(`Membaca file (${i + 1}/${totalFiles}): ${file.name}...`);
        
        const fileData = await parseSingleCsv(file);
        allStockData.push(...fileData);
      }

      if (allStockData.length === 0) {
        throw new Error('Tidak ada data valid yang ditemukan dari file CSV yang diunggah.');
      }

      setProgressText(`Menyimpan ${allStockData.length} baris data ke Supabase...`);

      // 2. Upsert Ticker unik ke tabel master 'stocks'
      const uniqueTickers = Array.from(new Set(allStockData.map((d) => d.ticker))).map((ticker) => ({
        ticker,
      }));

      const { error: stockError } = await supabase
        .from('stocks')
        .upsert(uniqueTickers, { onConflict: 'ticker' });

      if (stockError) throw stockError;

      // 3. Upsert data OHLCV harian ke 'daily_stock_prices' (dibagi per-batch 1000 baris agar ringan)
      const BATCH_SIZE = 1000;
      for (let i = 0; i < allStockData.length; i += BATCH_SIZE) {
        const batch = allStockData.slice(i, i + BATCH_SIZE);
        setProgressText(`Mengunggah ke database (${Math.min(i + BATCH_SIZE, allStockData.length)}/${allStockData.length} baris)...`);

        const { error: priceError } = await supabase
          .from('daily_stock_prices')
          .upsert(batch, { onConflict: 'ticker,date' });

        if (priceError) throw priceError;
      }

      setStatusMessage({
        type: 'success',
        text: `Berhasil mengunggah ${totalFiles} file CSV (${allStockData.length} baris data) ke Supabase!`,
      });

      if (onUploadSuccess) onUploadSuccess();
    } catch (error: any) {
      console.error('Error uploading CSV files:', error);
      setStatusMessage({
        type: 'error',
        text: error.message || 'Gagal memproses file CSV.',
      });
    } finally {
      setLoading(false);
      setProgressText('');
      event.target.value = '';
    }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
      <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-600 rounded-lg p-6 hover:border-emerald-500 transition-colors">
        {loading ? (
          <div className="flex flex-col items-center space-y-2 text-emerald-400">
            <Loader2 className="w-10 h-10 animate-spin" />
            <p className="text-sm font-medium">{progressText}</p>
          </div>
        ) : (
          <label className="flex flex-col items-center cursor-pointer">
            <div className="flex items-center space-x-1 text-slate-400 mb-2 hover:text-emerald-400 transition-colors">
              <Upload className="w-8 h-8" />
              <Files className="w-6 h-6" />
            </div>
            <span className="text-sm font-semibold text-slate-200">
              Klik untuk Upload File CSV (Bisa Pilih Banyak File)
            </span>
            <span className="text-xs text-slate-400 mt-1">
              Tekan Ctrl / Shift saat memilih file untuk memilih beberapa file sekaligus.
            </span>
            <input
              type="file"
              accept=".csv"
              multiple // <--- Memungkinkan multi-file selection
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        )}
      </div>

      {statusMessage && (
        <div
          className={`mt-4 p-3 rounded-lg flex items-center space-x-2 text-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border border-rose-800 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}
    </div>
  );
};