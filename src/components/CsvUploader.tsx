import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import type { StockCsvRow, StockPriceData } from '../types/stock';
import { 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Files, 
  FileText,
  X,
  Database
} from 'lucide-react';

export const CsvUploader: React.FC<{ onUploadSuccess?: () => void }> = ({ onUploadSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

              let day = dateParts[0].padStart(2, '0');
              let month = dateParts[1].padStart(2, '0');
              let year = dateParts[2];

              // Format YYYY-MM-DD detection
              if (dateParts[0].length === 4) {
                year = dateParts[0];
                month = dateParts[1].padStart(2, '0');
                day = dateParts[2].padStart(2, '0');
              } else if (year.length === 2) {
                year = `20${year}`;
              }

              const formattedDate = `${year}-${month}-${day}`;

              const openPrice = parseFloat(row.Open || '0');
              const highPrice = parseFloat(row.High || '0');
              const lowPrice = parseFloat(row.Low || '0');
              const closePrice = parseFloat(row.Close || '0');
              const vol = parseFloat(row['Volume(Unit)'] || row.Volume || '0');

              if (isNaN(closePrice) || closePrice <= 0) continue;

              formattedData.push({
                ticker,
                date: formattedDate,
                open: isNaN(openPrice) ? closePrice : openPrice,
                high: isNaN(highPrice) ? closePrice : highPrice,
                low: isNaN(lowPrice) ? closePrice : lowPrice,
                close: closePrice,
                volume: isNaN(vol) ? 0 : vol,
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

  const processFiles = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;

    setLoading(true);
    setStatusMessage(null);
    setProgressPct(0);

    try {
      const filesArray = Array.from(fileList);
      const totalFiles = filesArray.length;
      const rawStockData: StockPriceData[] = [];

      // 1. Membaca semua file CSV berurutan
      for (let i = 0; i < totalFiles; i++) {
        const file = filesArray[i];
        const pct = Math.round(((i + 1) / (totalFiles * 2)) * 100);
        setProgressPct(pct);
        setProgressText(`Membaca file (${i + 1}/${totalFiles}): ${file.name}...`);

        const fileData = await parseSingleCsv(file);
        rawStockData.push(...fileData);
      }

      if (rawStockData.length === 0) {
        throw new Error('Tidak ada data OHLCV valid yang ditemukan dari file CSV yang diunggah.');
      }

      // Deduplikasi data lokal (menghapus duplikat ticker + date) sebelum dikirim ke Supabase
      const uniqueDataMap = new Map<string, StockPriceData>();
      rawStockData.forEach((item) => {
        const key = `${item.ticker}_${item.date}`;
        uniqueDataMap.set(key, item);
      });
      const allStockData = Array.from(uniqueDataMap.values());

      setProgressText(`Menyiapkan ${allStockData.length} baris data unik ke Supabase...`);

      // 2. Upsert Ticker unik ke master table 'stocks'
      const uniqueTickers = Array.from(new Set(allStockData.map((d) => d.ticker))).map((ticker) => ({
        ticker,
      }));

      const { error: stockError } = await supabase
        .from('stocks')
        .upsert(uniqueTickers, { onConflict: 'ticker' });

      if (stockError) throw stockError;

      // 3. Upsert data OHLCV harian ke 'daily_stock_prices' (BATCH_SIZE = 1000)
      const BATCH_SIZE = 1000;
      const totalBatches = Math.ceil(allStockData.length / BATCH_SIZE);

      for (let i = 0; i < allStockData.length; i += BATCH_SIZE) {
        const batch = allStockData.slice(i, i + BATCH_SIZE);
        const currentBatchIndex = Math.floor(i / BATCH_SIZE) + 1;
        
        // Perhitungan Progress Persentase (50% - 100%)
        const currentProgressPct = 50 + Math.round((currentBatchIndex / totalBatches) * 50);
        setProgressPct(currentProgressPct);

        const loadedRows = Math.min(i + BATCH_SIZE, allStockData.length);
        setProgressText(`Mengunggah ke database (${loadedRows}/${allStockData.length} baris)...`);

        const { error: priceError } = await supabase
          .from('daily_stock_prices')
          .upsert(batch, { onConflict: 'ticker,date' });

        if (priceError) throw priceError;
      }

      setProgressPct(100);
      setStatusMessage({
        type: 'success',
        text: `Berhasil mengunggah ${totalFiles} file CSV (${allStockData.length} baris data) ke Supabase!`,
      });

      if (onUploadSuccess) {
        setTimeout(() => {
          onUploadSuccess();
        }, 1200);
      }
    } catch (error: any) {
      console.error('Error uploading CSV files:', error);
      setStatusMessage({
        type: 'error',
        text: error.message || 'Gagal memproses file CSV.',
      });
    } finally {
      setLoading(false);
      setProgressText('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      processFiles(event.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 sm:p-10 transition-all duration-200 ${
          isDragging 
            ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]' 
            : 'border-slate-700 hover:border-emerald-500/60 bg-slate-950/60'
        }`}
      >
        {loading ? (
          <div className="flex flex-col items-center space-y-3 w-full max-w-md text-center">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            
            <div className="w-full space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slate-300">
                <span>Memproses Data</span>
                <span className="text-emerald-400">{progressPct}%</span>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/80">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <p className="text-xs text-slate-400 font-medium animate-pulse">{progressText}</p>
          </div>
        ) : (
          <label className="flex flex-col items-center cursor-pointer text-center w-full">
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl text-slate-300 mb-3 shadow-inner group-hover:border-emerald-500/40 transition-colors">
              <div className="flex items-center gap-1.5">
                <Upload className="w-6 h-6 text-emerald-400" />
                <Files className="w-5 h-5 text-teal-400" />
              </div>
            </div>

            <span className="text-sm sm:text-base font-bold text-slate-100">
              Pilih / Hela File CSV Saham (Multi-File)
            </span>

            <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
              Dapat memilih beberapa file CSV harian sekaligus. Format standar OHLCV AmiBroker / TradingView disupport.
            </p>

            <span className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors shadow">
              Jelajahi File CSV
            </span>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        )}
      </div>

      {/* Info Card Format CSV */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 flex items-start gap-3 text-xs text-slate-400">
        <Database className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-300">Format Kolom CSV yang Diharapkan:</p>
          <p className="font-mono text-[11px] text-slate-400">
            Ticker, Date/Time, Open, High, Low, Close, Volume(Unit)
          </p>
        </div>
      </div>

      {/* Status Message */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl flex items-center justify-between space-x-2 text-xs sm:text-sm font-medium ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/80 border border-emerald-800/80 text-emerald-300'
              : 'bg-rose-950/80 border border-rose-800/80 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>

          <button
            onClick={() => setStatusMessage(null)}
            className="p-1 hover:bg-black/20 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};