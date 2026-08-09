import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AIAnalysisViewerProps {
  content: string;
}

export const AIAnalysisViewer: React.FC<AIAnalysisViewerProps> = React.memo(({ content }) => {
  // 1. Cleansing Teks: Buang blok JSON_SUMMARY, JSON raw, & rapikan format tabel Markdown
  const cleanContent = useMemo(() => {
    if (!content) return '';
    return content
      .replace(/---JSON_SUMMARY---[\s\S]*?---END_JSON_SUMMARY---/gi, '') // Hapus blok JSON
      .replace(/```json[\s\S]*?```/gi, '')                               // Hapus jika ada JSON block raw
      .replace(/\| *\|/g, '|\n|')                                        // Perbaiki jika baris tabel menempel
      .trim();
  }, [content]);

  return (
    <div className="w-full text-slate-200 text-xs sm:text-sm leading-relaxed space-y-3 sm:space-y-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]} // Mengaktifkan renderer tabel & GFM Markdown
        components={{
          // Header Utama (# Header)
          h1: ({ children }) => (
            <h1 className="text-base sm:text-xl font-extrabold text-emerald-400 border-b border-slate-800 pb-2 my-3 sm:my-4 tracking-wide">
              {children}
            </h1>
          ),
          // Sub Header Utama (## Header / ## 1. Rincian Evaluasi Skor)
          h2: ({ children }) => (
            <h2 className="text-xs sm:text-base font-bold text-slate-100 bg-slate-800/80 px-3 py-2 rounded-xl border-l-4 border-emerald-500 my-3.5 shadow-sm block">
              {children}
            </h2>
          ),
          // Sub-sub Header (### Header)
          h3: ({ children }) => (
            <h3 className="text-xs sm:text-sm font-semibold text-emerald-300 bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-800/40 my-2.5 block">
              {children}
            </h3>
          ),
          // Paragraf Biasa
          p: ({ children }) => (
            <p className="text-slate-300 my-1.5 sm:my-2 leading-relaxed text-xs sm:text-sm">
              {children}
            </p>
          ),
          // Teks BOLD (**bold**) - Diperbaiki agar tidak memicu line-break mendadak
          strong: ({ children }) => (
            <strong className="font-bold text-emerald-300 bg-emerald-950/50 px-1 py-0.5 rounded border border-emerald-800/40 inline">
              {children}
            </strong>
          ),
          // Unordered List (-)
          ul: ({ children }) => (
            <ul className="space-y-1.5 my-2 block pl-0">{children}</ul>
          ),
          // Item Unordered List
          li: ({ children }) => (
            <li className="flex items-start gap-2 text-slate-300 text-xs sm:text-sm my-1">
              <span className="text-emerald-400 font-bold shrink-0 mt-0.5 select-none">•</span>
              <div className="flex-1 leading-relaxed">{children}</div>
            </li>
          ),
          // Ordered List (1. 2. 3.)
          ol: ({ children }) => (
            <ol className="space-y-1.5 my-2 pl-4 list-decimal marker:text-emerald-400 marker:font-bold text-slate-300 text-xs sm:text-sm">
              {children}
            </ol>
          ),
          // Warning / Red Flags Blockquote (>)
          blockquote: ({ children }) => (
            <div className="bg-amber-950/30 border-l-4 border-amber-500 p-3 my-3 rounded-r-xl text-amber-200 text-xs sm:text-sm leading-relaxed backdrop-blur-xs">
              {children}
            </div>
          ),
          // Styling TABEL Modern Dark Mode dengan Smooth Scroll
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 sm:my-4 rounded-xl border border-slate-800 shadow-lg bg-slate-950/60 scroll-smooth">
              <table className="w-full text-left text-xs text-slate-200 border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-950 text-emerald-400 uppercase font-bold text-[10px] sm:text-[11px] border-b border-slate-800 tracking-wider">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">{children}</tbody>
          ),
          tr: ({ children }) => <tr className="hover:bg-slate-800/40 transition-colors">{children}</tr>,
          th: ({ children }) => <th className="p-2.5 sm:p-3 font-bold border-b border-slate-800 whitespace-nowrap">{children}</th>,
          td: ({ children }) => <td className="p-2.5 sm:p-3 border-b border-slate-800/50">{children}</td>,
          // Horizontal Rule (---)
          hr: () => <hr className="border-slate-800 my-4" />,
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
});

AIAnalysisViewer.displayName = 'AIAnalysisViewer';