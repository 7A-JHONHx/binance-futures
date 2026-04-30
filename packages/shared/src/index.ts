import type { BootstrapSnapshot, TradingMode } from "./trading/types.js";

export type { BootstrapSnapshot, TradingMode };

export interface DashboardOverviewAnalysis {
  symbol?: string;
  mode?: string;
  timestamp: string | number | null;
  decision: string;
  longScore: number | null;
  shortScore: number | null;
  close: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atrPercent: number | null;
  volumeRatio: number | null;
  orderBookImbalance: number | null;
  candleBodyRatio: number | null;
}

export interface DashboardOverviewTrade {
  symbol?: string;
  mode?: string;
  timestamp: string | number | null;
  openedAt: string | number | null;
  closedAt: string | number | null;
  side: string;
  action: string;
  entryPrice: number | null;
  exitPrice: number | null;
  quantity: number | null;
  pnlUsdt: number | null;
  reason: string | null;
}

export interface DashboardOverviewPayload {
  generatedAt: string;
  source: string;
  refreshIntervalMs: number;
  snapshot: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  trades: DashboardOverviewTrade[];
  analyses: DashboardOverviewAnalysis[];
}

export interface DomainCollectionResponse<T> {
  source: string;
  symbol: string;
  mode: string;
  count: number;
  items: T[];
}

export interface BotStatusCurrentResponse {
  source: string;
  symbol: string;
  mode: string;
  snapshot: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
}

export interface BotSettingEntry {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string | null;
}

export interface BotSettingCollectionResponse {
  source: string;
  count: number;
  items: BotSettingEntry[];
}

export interface BotSettingMutationResponse {
  source: string;
  item: BotSettingEntry;
}

export function createBootstrapSnapshot(input: {
  service: string;
  mode: TradingMode;
  symbol: string;
}): BootstrapSnapshot {
  return {
    service: input.service,
    mode: input.mode,
    symbol: input.symbol,
    generatedAt: new Date().toISOString(),
  };
}
