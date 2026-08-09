import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AIAnalysisViewerProps {
  content: string;
}

export const AIAnalysisViewer: React.FC<AIAnalysisViewerProps> = ({ content }) => {
  // 1. Cleansing Teks: Buang blok JSON_SUMMARY & rapikan pindah baris
  const cleanContent = content
    ? content
        .replace(/---JSON_SUMMARY---[\s\S]*?---END_JSON_SUMMARY---/gi, '') // Hapus blok JSON
        .replace(/```json[\s\S]*?```/gi, '')                               // Hapus jika ada JSON block
        .replace(/\| *\|/g, '|\n|')                                         // Perbaiki jika baris tabel menempel
        .trim()
    : '';

  return (
    <div className="w-full text-slate-200 text-xs sm:text-sm leading-relaxed space-y-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]} // 👈 PENTING: Mengaktifkan renderer tabel & GFM Markdown
        components={{
          // Header Utama (# Header)
          h1: ({ children }) => (
            <h1 className="text-lg sm:text-xl font-extrabold text-emerald-400 border-b border-slate-700/80 pb-2 my-4">
              {children}
            </h1>
          ),
          // Sub Header Utama (## Header / ## 1. Rincian Evaluasi Skor)
          h2: ({ children }) => (
            <h2 className="text-sm sm:text-base font-bold text-slate-100 bg-slate-800/90 px-3 py-2.5 rounded-lg border-l-4 border-emerald-500 my-4 shadow-sm block">
              {children}
            </h2>
          ),
          // Sub-sub Header (### Header)
          h3: ({ children }) => (
            <h3 className="text-xs sm:text-sm font-semibold text-emerald-300 bg-emerald-950/40 px-3 py-1.5 rounded border border-emerald-800/40 my-3 block">
              {children}
            </h3>
          ),
          // Paragraf Biasa
          p: ({ children }) => (
            <p className="text-slate-300 my-2 leading-relaxed text-xs sm:text-sm">
              {children}
            </p>
          ),
          // Teks BOLD (**bold**)
          strong: ({ children }) => (
            <strong className="font-bold text-emerald-300 bg-emerald-950/60 px-1 py-0.5 rounded border border-emerald-800/50 inline-block my-0.5">
              {children}
            </strong>
          ),
          // Daftar Bullet Unordered List (-)
          ul: ({ children }) => (
            <ul className="space-y-2 my-2 block pl-0">{children}</ul>
          ),
          // Item List Unordered
          li: ({ children }) => (
            <li className="flex items-start gap-2 text-slate-300 text-xs sm:text-sm my-1">
              <span className="text-emerald-400 font-bold shrink-0 mt-0.5">•</span>
              <div className="flex-1 leading-relaxed">{children}</div>
            </li>
          ),
          // Order List (1. 2. 3.)
          ol: ({ children }) => (
            <ol className="space-y-2 my-2 pl-4 list-decimal marker:text-emerald-400 marker:font-bold text-slate-300">
              {children}
            </ol>
          ),
          // Warning / Red Flags Blockquote (>)
          blockquote: ({ children }) => (
            <div className="bg-amber-950/40 border-l-4 border-amber-500 p-3 my-3 rounded-r-lg text-amber-200 text-xs sm:text-sm">
              {children}
            </div>
          ),
          // Styling TABEL Modern Dark Mode
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-xl border border-slate-700/80 shadow-md">
              <table className="w-full text-left text-xs text-slate-200 border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-800 text-emerald-400 uppercase font-semibold text-[11px] border-b border-slate-700">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">{children}</tbody>
          ),
          tr: ({ children }) => <tr className="hover:bg-slate-800/40 transition-colors">{children}</tr>,
          th: ({ children }) => <th className="p-3 font-bold border-b border-slate-700">{children}</th>,
          td: ({ children }) => <td className="p-3 border-b border-slate-800/60">{children}</td>,
          // Horizontal Rule (---)
          hr: () => <hr className="border-slate-700/60 my-4" />,
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
};