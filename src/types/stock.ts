// src/types/stock.ts

export interface StockCsvRow {
  Ticker?: string;
  ticker?: string;
  'Date/Time'?: string;
  Date?: string;
  date?: string;
  Open?: string;
  open?: string;
  High?: string;
  high?: string;
  Low?: string;
  low?: string;
  Close?: string;
  close?: string;
  'Volume(Unit)'?: string;
  'Volume (Unit)'?: string;
  Volume?: string;
  volume?: string;
  [key: string]: string | undefined; // Menyokong sebarang nama header CSV tambahan secara fleksibel
}

export interface StockPriceData {
  ticker: string;
  date: string; // Format: YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}