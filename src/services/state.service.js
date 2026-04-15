import { promises as fs } from "fs";
import path from "path";
import { tradingConfig } from "../config/trading.config.js";

const runtimeDir = path.resolve(process.cwd(), ".runtime");
const stateFile = path.join(runtimeDir, "strategy-state.json");

function createDefaultState() {
  return {
    version: 1,
    position: {
      isOpen: false,
      side: "NONE",
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      quantity: 0,
      atr: 0,
      highestPrice: 0,
      lowestPrice: 0,
      openedAt: null,
      signalCandleOpenTime: null,
      reservedMargin: 0,
      entryFee: 0,
    },
    runtime: {
      isProcessing: false,
      lastAnalysisAt: 0,
      lastTradeCandleOpenTime: null,
      cooldownUntil: 0,
      lastExchangeSyncAt: 0,
      latestPrice: null,
      lastSnapshotAt: 0,
    },
    analysis: {
      lastDecision: "NONE",
      lastSummary: null,
      lastAnalyzedAt: 0,
    },
    portfolio: {
      paperAvailableBalance: tradingConfig.paperStartBalance,
      paperAllocatedMargin: 0,
      realizedPnl: 0,
      feesPaid: 0,
      tradesClosed: 0,
      wins: 0,
      losses: 0,
    },
  };
}

let state = createDefaultState();

function mergeState(candidate) {
  const defaults = createDefaultState();

  return {
    ...defaults,
    ...candidate,
    position: {
      ...defaults.position,
      ...candidate?.position,
    },
    runtime: {
      ...defaults.runtime,
      ...candidate?.runtime,
      isProcessing: false,
    },
    analysis: {
      ...defaults.analysis,
      ...candidate?.analysis,
    },
    portfolio: {
      ...defaults.portfolio,
      ...candidate?.portfolio,
    },
  };
}

export async function loadState() {
  await fs.mkdir(runtimeDir, { recursive: true });

  try {
    const contents = await fs.readFile(stateFile, "utf8");
    state = mergeState(JSON.parse(contents));
  } catch (error) {
    if (error.code === "ENOENT") {
      state = createDefaultState();
      await saveState();
      return state;
    }

    throw error;
  }

  return state;
}

export function getState() {
  return state;
}

export async function saveState() {
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
}

export function resetPositionState() {
  const defaults = createDefaultState();
  state.position = defaults.position;
}
