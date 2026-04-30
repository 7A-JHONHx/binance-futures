import { promises as fs } from "fs";
import path from "path";
import { tradingConfig } from "../config/trading.config.js";

const runtimeDir = path.resolve(process.cwd(), ".runtime");
const stateFile = path.join(runtimeDir, "strategy-state.json");

export function getTradingDayKey(timestamp = Date.now()) {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tradingConfig.dailyResetTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    return formatter.format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

function createDailyState(timestamp = Date.now()) {
  return {
    tradingDay: getTradingDayKey(timestamp),
    entriesOpened: 0,
    tradesClosed: 0,
    netRealizedPnl: 0,
    positivePnl: 0,
    negativePnl: 0,
    tradingPaused: false,
    pauseReason: null,
    pausedAt: null,
  };
}

function createProtectionOrderState(type) {
  return {
    kind: type,
    enabled: false,
    orderId: null,
    clientOrderId: null,
    status: "NONE",
    side: null,
    type: null,
    stopPrice: 0,
    avgPrice: 0,
    closePosition: false,
    workingType: tradingConfig.protectionWorkingType,
    priceProtect: tradingConfig.protectionPriceProtect,
    updatedAt: null,
    lastSyncedAt: null,
  };
}

function createDefaultState() {
  return {
    version: 1,
    position: {
      isOpen: false,
      side: "NONE",
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      takeProfitArmed: false,
      exitSource: null,
      quantity: 0,
      atr: 0,
      highestPrice: 0,
      lowestPrice: 0,
      openedAt: null,
      signalCandleOpenTime: null,
      reservedMargin: 0,
      entryFee: 0,
      protectionOrders: {
        stop: createProtectionOrderState("STOP"),
        takeProfit: createProtectionOrderState("TAKE_PROFIT"),
      },
    },
    runtime: {
      isProcessing: false,
      lastAnalysisAt: 0,
      lastTradeCandleOpenTime: null,
      cooldownUntil: 0,
      contextualCooldown: {
        active: false,
        blockedSide: "NONE",
        reason: null,
        activatedAt: 0,
        releaseAfter: 0,
      },
      lastExchangeSyncAt: 0,
      latestPrice: null,
      lastSnapshotAt: 0,
      lastTelegramStatusAt: 0,
    },
    analysis: {
      lastDecision: "NONE",
      lastSummary: null,
      lastAnalyzedAt: 0,
    },
    activity: {
      lastEntryAt: null,
      lastEntrySide: "NONE",
      lastEntryPrice: 0,
      lastExitAt: null,
      lastExitSide: "NONE",
      lastExitPrice: 0,
      lastExitReason: null,
      lastExitPnlUsdt: 0,
      lastTradeAt: null,
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
    daily: createDailyState(),
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
      protectionOrders: {
        ...defaults.position.protectionOrders,
        ...candidate?.position?.protectionOrders,
        stop: {
          ...defaults.position.protectionOrders.stop,
          ...candidate?.position?.protectionOrders?.stop,
        },
        takeProfit: {
          ...defaults.position.protectionOrders.takeProfit,
          ...candidate?.position?.protectionOrders?.takeProfit,
        },
      },
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
    activity: {
      ...defaults.activity,
      ...candidate?.activity,
    },
    portfolio: {
      ...defaults.portfolio,
      ...candidate?.portfolio,
    },
    daily: {
      ...defaults.daily,
      ...candidate?.daily,
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

export function syncDailyState(timestamp = Date.now()) {
  const tradingDay = getTradingDayKey(timestamp);

  if (state.daily.tradingDay === tradingDay) {
    return false;
  }

  state.daily = createDailyState(timestamp);
  return true;
}

export function resetPositionState() {
  const defaults = createDefaultState();
  state.position = defaults.position;
}
