import type { TradingMode } from "@binance-futures/shared";

export type PositionSide = "NONE" | "LONG" | "SHORT";
export type AnalysisDecision = "NONE" | "LONG" | "SHORT";

export interface LegacyPositionSnapshot {
  isOpen: boolean;
  side: PositionSide;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  atr: number;
  highestPrice: number;
  lowestPrice: number;
  openedAt: number | null;
  signalCandleOpenTime: number | null;
}

export interface LegacyRuntimeSnapshot {
  isProcessing: boolean;
  cooldownUntil: number;
  latestPrice: number | null;
  lastAnalysisAt: number;
  lastTradeCandleOpenTime: number | null;
}

export interface LegacyAnalysisSnapshot {
  lastDecision: AnalysisDecision;
  lastAnalyzedAt: number;
}

export interface LegacyDailySnapshot {
  tradingDay: string;
  entriesOpened: number;
  tradesClosed: number;
  netRealizedPnl: number;
  positivePnl: number;
  negativePnl: number;
  tradingPaused: boolean;
  pauseReason: string | null;
}

export interface LegacyWorkerStateSnapshot {
  position: LegacyPositionSnapshot;
  runtime: LegacyRuntimeSnapshot;
  analysis: LegacyAnalysisSnapshot;
  daily: LegacyDailySnapshot;
}

export interface TradingEngineBootstrapResult {
  syncReady: boolean;
  runtimeEnabled: boolean;
  symbol: string;
  mode: TradingMode;
  stateSnapshot: LegacyWorkerStateSnapshot | null;
}
