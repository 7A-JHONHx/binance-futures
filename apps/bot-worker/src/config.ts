import type { TradingMode } from "@binance-futures/shared";

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on", "sim"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off", "nao", "não"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export const workerConfig = {
  serviceName: "@binance-futures/bot-worker",
  symbol: process.env.SYMBOL || "BTCUSDT",
  mode: (process.env.TRADING_MODE === "paper" ? "paper" : "live") as TradingMode,
  syncIntervalMs: parseNumber(process.env.NEW_PLATFORM_SYNC_INTERVAL_MS, 10000),
  runtimeStateFileName: "new-platform-sync-state.json",
  databaseUrl: process.env.DATABASE_URL || "",
  databaseEnabled: Boolean(process.env.DATABASE_URL),
  operationalRuntimeEnabled: parseBoolean(process.env.NEW_PLATFORM_OPERATION_ENABLED, true),
};
