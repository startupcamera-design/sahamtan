export interface StockCsvRow {
  Ticker: string;
  'Date/Time': string;
  Open: string;
  High: string;
  Low: string;
  Close: string;
  'Volume(Unit)': string;
}

export interface StockPriceData {
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}