import { pathToFileURL } from "node:url";
import { resolveRepoPath } from "../repo-paths.js";
import type {
  LegacyWorkerStateSnapshot,
  AnalysisDecision,
  PositionSide,
} from "../trading-engine.types.js";

type LegacyStateModule = {
  loadState: () => Promise<unknown>;
  getState: () => unknown;
  saveState: () => Promise<void>;
  syncDailyState: (timestamp?: number) => boolean;
  resetPositionState: () => void;
};

let stateModulePromise: Promise<LegacyStateModule> | null = null;

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toPositionSide(value: unknown): PositionSide {
  return value === "LONG" || value === "SHORT" ? value : "NONE";
}

function toDecision(value: unknown): AnalysisDecision {
  return value === "LONG" || value === "SHORT" ? value : "NONE";
}

function normalizeState(state: unknown): LegacyWorkerStateSnapshot {
  const candidate = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  const position = candidate.position && typeof candidate.position === "object"
    ? (candidate.position as Record<string, unknown>)
    : {};
  const runtime = candidate.runtime && typeof candidate.runtime === "object"
    ? (candidate.runtime as Record<string, unknown>)
    : {};
  const analysis = candidate.analysis && typeof candidate.analysis === "object"
    ? (candidate.analysis as Record<string, unknown>)
    : {};
  const daily = candidate.daily && typeof candidate.daily === "object"
    ? (candidate.daily as Record<string, unknown>)
    : {};

  return {
    position: {
      isOpen: toBoolean(position.isOpen),
      side: toPositionSide(position.side),
      entryPrice: toNumber(position.entryPrice),
      stopLoss: toNumber(position.stopLoss),
      takeProfit: toNumber(position.takeProfit),
      quantity: toNumber(position.quantity),
      atr: toNumber(position.atr),
      highestPrice: toNumber(position.highestPrice),
      lowestPrice: toNumber(position.lowestPrice),
      openedAt: toNullableNumber(position.openedAt),
      signalCandleOpenTime: toNullableNumber(position.signalCandleOpenTime),
    },
    runtime: {
      isProcessing: toBoolean(runtime.isProcessing),
      cooldownUntil: toNumber(runtime.cooldownUntil),
      latestPrice: toNullableNumber(runtime.latestPrice),
      lastAnalysisAt: toNumber(runtime.lastAnalysisAt),
      lastTradeCandleOpenTime: toNullableNumber(runtime.lastTradeCandleOpenTime),
    },
    analysis: {
      lastDecision: toDecision(analysis.lastDecision),
      lastAnalyzedAt: toNumber(analysis.lastAnalyzedAt),
    },
    daily: {
      tradingDay: toStringValue(daily.tradingDay),
      entriesOpened: toNumber(daily.entriesOpened),
      tradesClosed: toNumber(daily.tradesClosed),
      netRealizedPnl: toNumber(daily.netRealizedPnl),
      positivePnl: toNumber(daily.positivePnl),
      negativePnl: toNumber(daily.negativePnl),
      tradingPaused: toBoolean(daily.tradingPaused),
      pauseReason:
        typeof daily.pauseReason === "string" && daily.pauseReason.length > 0
          ? daily.pauseReason
          : null,
    },
  };
}

async function loadLegacyStateModule() {
  if (!stateModulePromise) {
    stateModulePromise = import(
      pathToFileURL(resolveRepoPath("src", "services", "state.service.js")).href
    ) as Promise<LegacyStateModule>;
  }

  return stateModulePromise;
}

export class LegacyStateBridge {
  async load() {
    const stateModule = await loadLegacyStateModule();
    return normalizeState(await stateModule.loadState());
  }

  async getSnapshot() {
    const stateModule = await loadLegacyStateModule();
    return normalizeState(stateModule.getState());
  }

  async save() {
    const stateModule = await loadLegacyStateModule();
    await stateModule.saveState();
  }

  async syncDailyState(timestamp = Date.now()) {
    const stateModule = await loadLegacyStateModule();
    return stateModule.syncDailyState(timestamp);
  }

  async resetPositionState() {
    const stateModule = await loadLegacyStateModule();
    stateModule.resetPositionState();
  }
}
