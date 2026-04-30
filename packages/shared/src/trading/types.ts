export type TradingMode = "live" | "paper";

export interface BootstrapSnapshot {
  service: string;
  mode: TradingMode;
  symbol: string;
  generatedAt: string;
}
