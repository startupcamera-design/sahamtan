import React from 'react';
import ReactMarkdown from 'react-markdown';

interface AIAnalysisViewerProps {
  content: string;
}

export const AIAnalysisViewer: React.FC<AIAnalysisViewerProps> = ({ content }) => {
  return (
    <div className="prose prose-invert max-w-none text-slate-200 text-sm space-y-4">
      <ReactMarkdown
        components={{
          // Format Judul Utama (# Header)
          h1: ({ children }) => (
            <h1 className="text-xl font-extrabold text-emerald-400 border-b border-slate-700 pb-2 mb-4">
              {children}
            </h1>
          ),
          // Format Sub Judul (### Header)
          h3: ({ children }) => (
            <h3 className="text-base font-bold text-slate-100 bg-slate-900/80 p-3 rounded-lg border-l-4 border-emerald-500 mt-6 mb-3 shadow-sm">
              {children}
            </h3>
          ),
          // Format Paragraph
          p: ({ children }) => <p className="leading-relaxed text-slate-300 my-2">{children}</p>,
          // Format Teks Tebal (**bold**)
          strong: ({ children }) => (
            <strong className="font-bold text-emerald-300 bg-emerald-950/40 px-1 py-0.5 rounded border border-emerald-800/40">
              {children}
            </strong>
          ),
          // Format Bullet List (-)
          ul: ({ children }) => <ul className="space-y-2 my-3 pl-2">{children}</ul>,
          li: ({ children }) => (
            <li className="flex items-start gap-2 text-slate-300">
              <span className="text-emerald-400 mt-1.5 text-xs">●</span>
              <div className="flex-1">{children}</div>
            </li>
          ),
          // Format Garis Pembatas (---)
          hr: () => <hr className="border-slate-700/60 my-4" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};