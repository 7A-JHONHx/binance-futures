export type LegacyTradeRecord = {
  symbol: string;
  mode: string;
  timestamp: number | null;
  side: string;
  action: string;
  entryPrice: number | null;
  exitPrice: number | null;
  quantity: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  pnlUsdt: number | null;
  pnlBrl: number | null;
  fees: number | null;
  reason: string | null;
  openedAt: number | null;
  closedAt: number | null;
  signalCandleOpenTime: number | null;
  analysisDecision: string | null;
};

export type LegacyAnalysisRecord = {
  symbol: string;
  mode: string;
  timestamp: number | null;
  decision: string;
  longScore: number | null;
  shortScore: number | null;
  close: number | null;
  emaFast: number | null;
  emaSlow: number | null;
  emaTrend: number | null;
  smaTrend: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr: number | null;
  atrPercent: number | null;
  volumeRatio: number | null;
  orderBookImbalance: number | null;
  candleBodyRatio: number | null;
  signalCandleOpenTime: number | null;
};

export type SyncState = {
  snapshotGeneratedAt: number | null;
  metricsGeneratedAt: number | null;
  latestTradeTimestamp: number | null;
  latestAnalysisTimestamp: number | null;
};
