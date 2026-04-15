import { tradingConfig } from "../config/trading.config.js";
import { analyzeMarket } from "./analysis.service.js";
import { executeEntryOrder, executeExitOrder, isPaperTrading } from "./execution.service.js";
import { recordAnalysis, recordTrade, saveMetrics, saveStatusSnapshot } from "./journal.service.js";
import {
  calculateOrderQuantity,
  getOpenPosition,
  getUSDTBRL,
  getUSDTBalance,
} from "./market.service.js";
import { buildPerformanceMetrics, buildStatusSnapshot } from "./monitoring.service.js";
import { getState, loadState, resetPositionState, saveState } from "./state.service.js";
import { sendMessage } from "./telegram.service.js";
import { logError, logInfo, logWarn } from "../utils/logger.js";

let tickLock = false;

function getPositionSnapshot(position) {
  return {
    side: position.side,
    entryPrice: position.entryPrice,
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    quantity: position.quantity,
    atr: position.atr,
    highestPrice: position.highestPrice,
    lowestPrice: position.lowestPrice,
    signalCandleOpenTime: position.signalCandleOpenTime,
    reservedMargin: position.reservedMargin,
  };
}

function buildEntryNotification(side, position, analysisSummary, totalBrl) {
  return [
    `${side} ENTRY EXECUTED`,
    "",
    `Symbol: ${tradingConfig.symbol}`,
    `Mode: ${tradingConfig.tradingMode}`,
    `Entry: ${position.entryPrice.toFixed(2)}`,
    `Quantity: ${position.quantity}`,
    `Notional BRL: ${totalBrl.toFixed(2)}`,
    `Stop: ${position.stopLoss.toFixed(2)}`,
    `Take Profit: ${position.takeProfit.toFixed(2)}`,
    `ATR: ${position.atr.toFixed(2)}`,
    `RSI: ${analysisSummary.rsi.toFixed(2)}`,
    `MACD Histogram: ${analysisSummary.macdHistogram.toFixed(4)}`,
    `Volume Ratio: ${analysisSummary.volumeRatio.toFixed(2)}`,
    `Book Imbalance: ${analysisSummary.orderBookImbalance.toFixed(3)}`,
  ].join("\n");
}

function buildExitNotification(reason, side, exitPrice, pnlUsdt, pnlBrl) {
  return [
    `${reason}`,
    "",
    `Symbol: ${tradingConfig.symbol}`,
    `Mode: ${tradingConfig.tradingMode}`,
    `Position: ${side}`,
    `Exit: ${exitPrice.toFixed(2)}`,
    `Result USDT: ${pnlUsdt.toFixed(2)}`,
    `Result BRL: ${pnlBrl.toFixed(2)}`,
  ].join("\n");
}

function getEntryStops(side, entryPrice, atr) {
  if (side === "LONG") {
    return {
      stopLoss: entryPrice - atr * tradingConfig.stopLossAtrMultiple,
      takeProfit: entryPrice + atr * tradingConfig.takeProfitAtrMultiple,
    };
  }

  return {
    stopLoss: entryPrice + atr * tradingConfig.stopLossAtrMultiple,
    takeProfit: entryPrice - atr * tradingConfig.takeProfitAtrMultiple,
  };
}

function getTrailingStop(side, extremePrice, atr) {
  if (side === "LONG") {
    return extremePrice - atr * tradingConfig.trailingAtrMultiple;
  }

  return extremePrice + atr * tradingConfig.trailingAtrMultiple;
}

function calculateGrossPnl(side, entryPrice, exitPrice, quantity) {
  if (side === "LONG") {
    return (exitPrice - entryPrice) * quantity;
  }

  return (entryPrice - exitPrice) * quantity;
}

async function publishMonitoring(latestPrice = null, force = false) {
  const state = getState();
  const now = Date.now();

  if (latestPrice !== null) {
    state.runtime.latestPrice = latestPrice;
  }

  if (
    !force &&
    now - state.runtime.lastSnapshotAt < tradingConfig.monitoringSnapshotIntervalMs
  ) {
    return;
  }

  state.runtime.lastSnapshotAt = now;
  await saveState();

  await Promise.all([
    saveStatusSnapshot(buildStatusSnapshot({ state, latestPrice: state.runtime.latestPrice })),
    saveMetrics(buildPerformanceMetrics({ state })),
  ]);
}

async function persistPositionReset(cooldownUntil = 0) {
  const state = getState();
  resetPositionState();
  state.runtime.isProcessing = false;
  state.runtime.cooldownUntil = cooldownUntil;
  await saveState();
}

async function synchronizeStateWithExchange() {
  const state = getState();

  if (isPaperTrading()) {
    state.runtime.lastExchangeSyncAt = Date.now();
    await saveState();
    return;
  }

  const exchangePosition = await getOpenPosition(tradingConfig.symbol);
  state.runtime.lastExchangeSyncAt = Date.now();

  if (!exchangePosition) {
    if (state.position.isOpen) {
      logWarn("Local position cleared because exchange has no open position");
      await persistPositionReset(state.runtime.cooldownUntil);
      await publishMonitoring(state.runtime.latestPrice, true);
      return;
    }

    await saveState();
    return;
  }

  const hasMatchingLocalPosition =
    state.position.isOpen &&
    state.position.side === exchangePosition.side &&
    Math.abs(state.position.quantity - exchangePosition.quantity) < 0.000001;

  if (hasMatchingLocalPosition) {
    await saveState();
    return;
  }

  const atrFallback = Math.max(exchangePosition.entryPrice * 0.003, 1);
  const atr = state.position.atr > 0 ? state.position.atr : atrFallback;
  const stops = getEntryStops(exchangePosition.side, exchangePosition.entryPrice, atr);
  const shouldReuseStops =
    state.position.isOpen && state.position.side === exchangePosition.side;

  state.position.isOpen = true;
  state.position.side = exchangePosition.side;
  state.position.entryPrice = exchangePosition.entryPrice;
  state.position.quantity = exchangePosition.quantity;
  state.position.atr = atr;
  state.position.reservedMargin =
    state.position.reservedMargin > 0 ? state.position.reservedMargin : tradingConfig.usdAmount;
  state.position.stopLoss =
    shouldReuseStops && state.position.stopLoss > 0 ? state.position.stopLoss : stops.stopLoss;
  state.position.takeProfit =
    shouldReuseStops && state.position.takeProfit > 0
      ? state.position.takeProfit
      : stops.takeProfit;
  state.position.highestPrice =
    exchangePosition.side === "LONG"
      ? Math.max(state.position.highestPrice || 0, exchangePosition.markPrice)
      : 0;
  state.position.lowestPrice =
    exchangePosition.side === "SHORT"
      ? state.position.lowestPrice > 0
        ? Math.min(state.position.lowestPrice, exchangePosition.markPrice)
        : exchangePosition.markPrice
      : 0;
  state.runtime.isProcessing = false;

  await saveState();
  await publishMonitoring(exchangePosition.markPrice, true);

  logInfo("Recovered open position from exchange", {
    symbol: tradingConfig.symbol,
    ...getPositionSnapshot(state.position),
  });
}

async function maybePeriodicSync() {
  const state = getState();

  if (Date.now() - state.runtime.lastExchangeSyncAt < tradingConfig.stateSyncIntervalMs) {
    return;
  }

  await synchronizeStateWithExchange();
}

async function getAvailableBalance() {
  if (isPaperTrading()) {
    return getState().portfolio.paperAvailableBalance;
  }

  return getUSDTBalance();
}

async function openPosition(side, livePrice, analysis) {
  const state = getState();
  const availableBalance = await getAvailableBalance();

  if (availableBalance < tradingConfig.usdAmount) {
    logWarn("Insufficient balance for entry", {
      availableBalance,
      requiredBalance: tradingConfig.usdAmount,
      mode: tradingConfig.tradingMode,
    });
    state.runtime.isProcessing = false;
    await saveState();
    await publishMonitoring(livePrice, true);
    return;
  }

  const quantity = await calculateOrderQuantity(livePrice);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    logWarn("Calculated quantity is invalid", { livePrice, quantity });
    state.runtime.isProcessing = false;
    await saveState();
    await publishMonitoring(livePrice, true);
    return;
  }

  const reservedMargin = tradingConfig.usdAmount;
  const orderResult = await executeEntryOrder({
    side,
    quantity,
    price: livePrice,
    reservedMargin,
  });
  const avgPrice = Number.parseFloat(orderResult.avgPrice || "0");
  const executedQty = Number.parseFloat(orderResult.executedQty || `${quantity}`);
  const entryPrice = avgPrice > 0 ? avgPrice : livePrice;
  const atr = analysis.metrics.atr;
  const { stopLoss, takeProfit } = getEntryStops(side, entryPrice, atr);

  state.position.isOpen = true;
  state.position.side = side;
  state.position.entryPrice = entryPrice;
  state.position.stopLoss = stopLoss;
  state.position.takeProfit = takeProfit;
  state.position.quantity = executedQty;
  state.position.atr = atr;
  state.position.highestPrice = side === "LONG" ? entryPrice : 0;
  state.position.lowestPrice = side === "SHORT" ? entryPrice : 0;
  state.position.openedAt = Date.now();
  state.position.signalCandleOpenTime = analysis.summary.signalCandleOpenTime;
  state.position.reservedMargin = reservedMargin;
  state.position.entryFee = Number.parseFloat(orderResult.paperFee || "0");
  state.runtime.isProcessing = false;
  state.runtime.lastTradeCandleOpenTime = analysis.summary.signalCandleOpenTime;

  await saveState();

  const usdtToBrl = await getUSDTBRL();
  const totalBrl = executedQty * entryPrice * usdtToBrl;

  await recordTrade({
    mode: tradingConfig.tradingMode,
    symbol: tradingConfig.symbol,
    side,
    action: "OPEN",
    entryPrice,
    exitPrice: null,
    quantity: executedQty,
    stopLoss,
    takeProfit,
    pnlUsdt: null,
    pnlBrl: null,
    fees: state.position.entryFee,
    reason: "ENTRY_SIGNAL",
    openedAt: state.position.openedAt,
    closedAt: null,
    signalCandleOpenTime: analysis.summary.signalCandleOpenTime,
    analysisDecision: analysis.summary.decision,
  });

  logInfo("Position opened", {
    symbol: tradingConfig.symbol,
    side,
    mode: tradingConfig.tradingMode,
    analysis: analysis.summary,
    ...getPositionSnapshot(state.position),
  });

  await sendMessage(
    buildEntryNotification(side, state.position, analysis.summary, totalBrl)
  );
  await publishMonitoring(livePrice, true);
}

async function closePosition(reason, livePrice) {
  const state = getState();
  const { side, quantity, entryPrice, openedAt, signalCandleOpenTime, reservedMargin, entryFee } =
    state.position;

  const orderResult = await executeExitOrder({
    side,
    quantity,
    price: livePrice,
    entryPrice,
    reservedMargin,
  });
  const avgPrice = Number.parseFloat(orderResult.avgPrice || "0");
  const exitPrice = avgPrice > 0 ? avgPrice : livePrice;
  const closeFee = Number.parseFloat(orderResult.paperFee || "0");
  const grossPnlUsdt = calculateGrossPnl(side, entryPrice, exitPrice, quantity);
  const netPnlUsdt =
    grossPnlUsdt - (isPaperTrading() ? entryFee + closeFee : 0);
  const pnlBrl = netPnlUsdt * (await getUSDTBRL());

  logInfo("Position closed", {
    symbol: tradingConfig.symbol,
    reason,
    mode: tradingConfig.tradingMode,
    side,
    entryPrice,
    exitPrice,
    quantity,
    grossPnlUsdt,
    netPnlUsdt,
    pnlBrl,
  });

  await recordTrade({
    mode: tradingConfig.tradingMode,
    symbol: tradingConfig.symbol,
    side,
    action: "CLOSE",
    entryPrice,
    exitPrice,
    quantity,
    stopLoss: state.position.stopLoss,
    takeProfit: state.position.takeProfit,
    pnlUsdt: netPnlUsdt,
    pnlBrl,
    fees: entryFee + closeFee,
    reason,
    openedAt,
    closedAt: Date.now(),
    signalCandleOpenTime,
    analysisDecision: state.analysis.lastDecision,
  });

  await sendMessage(buildExitNotification(reason, side, exitPrice, netPnlUsdt, pnlBrl));
  await persistPositionReset(Date.now() + tradingConfig.cooldownMs);
  await publishMonitoring(exitPrice, true);
}

async function manageOpenPosition(livePrice) {
  const state = getState();
  const position = state.position;
  let shouldPersist = false;

  if (position.side === "LONG") {
    if (livePrice > position.highestPrice) {
      position.highestPrice = livePrice;
      const trailingStop = getTrailingStop("LONG", livePrice, position.atr);

      if (trailingStop > position.stopLoss) {
        position.stopLoss = trailingStop;
      }

      shouldPersist = true;
    }

    if (livePrice >= position.takeProfit) {
      state.runtime.isProcessing = true;
      await saveState();
      await closePosition("TAKE PROFIT", livePrice);
      return;
    }

    if (livePrice <= position.stopLoss) {
      state.runtime.isProcessing = true;
      await saveState();
      await closePosition("STOP LOSS / TRAILING", livePrice);
      return;
    }
  } else if (position.side === "SHORT") {
    if (position.lowestPrice === 0 || livePrice < position.lowestPrice) {
      position.lowestPrice = livePrice;
      const trailingStop = getTrailingStop("SHORT", livePrice, position.atr);

      if (position.stopLoss === 0 || trailingStop < position.stopLoss) {
        position.stopLoss = trailingStop;
      }

      shouldPersist = true;
    }

    if (livePrice <= position.takeProfit) {
      state.runtime.isProcessing = true;
      await saveState();
      await closePosition("TAKE PROFIT", livePrice);
      return;
    }

    if (livePrice >= position.stopLoss) {
      state.runtime.isProcessing = true;
      await saveState();
      await closePosition("STOP LOSS / TRAILING", livePrice);
      return;
    }
  }

  if (shouldPersist) {
    await saveState();
    await publishMonitoring(livePrice, true);
  }
}

async function evaluateEntry(livePrice) {
  const state = getState();
  const now = Date.now();

  if (state.runtime.cooldownUntil > now) {
    return;
  }

  if (now - state.runtime.lastAnalysisAt < tradingConfig.analysisIntervalMs) {
    return;
  }

  state.runtime.lastAnalysisAt = now;
  await saveState();

  const analysis = await analyzeMarket(tradingConfig.symbol);
  state.analysis.lastDecision = analysis.summary.decision;
  state.analysis.lastSummary = analysis.summary;
  state.analysis.lastAnalyzedAt = now;
  await saveState();
  await recordAnalysis(analysis.summary);

  logInfo("Market analysis completed", {
    symbol: tradingConfig.symbol,
    mode: tradingConfig.tradingMode,
    ...analysis.summary,
  });

  await publishMonitoring(livePrice, true);

  if (analysis.decision === "NONE") {
    return;
  }

  if (state.runtime.lastTradeCandleOpenTime === analysis.summary.signalCandleOpenTime) {
    logInfo("Entry skipped because signal candle was already traded", {
      symbol: tradingConfig.symbol,
      signalCandleOpenTime: analysis.summary.signalCandleOpenTime,
      decision: analysis.decision,
    });
    return;
  }

  state.runtime.isProcessing = true;
  await saveState();
  await openPosition(analysis.decision, livePrice, analysis);
}

export async function initializeStrategy() {
  await loadState();
  await synchronizeStateWithExchange();
  await publishMonitoring(getState().runtime.latestPrice, true);
}

export async function handlePrice(price) {
  if (!Number.isFinite(price)) {
    logWarn("Received invalid price", { price });
    return;
  }

  if (tickLock) {
    return;
  }

  tickLock = true;

  try {
    const state = getState();
    state.runtime.latestPrice = price;
    await maybePeriodicSync();

    logInfo("Price tick received", {
      symbol: tradingConfig.symbol,
      mode: tradingConfig.tradingMode,
      price,
      ...getPositionSnapshot(state.position),
      cooldownUntil: state.runtime.cooldownUntil,
    });

    if (state.position.isOpen) {
      await manageOpenPosition(price);
    } else if (!state.runtime.isProcessing) {
      await evaluateEntry(price);
    }

    await publishMonitoring(price, false);
  } catch (error) {
    const state = getState();
    state.runtime.isProcessing = false;
    await saveState();
    await publishMonitoring(price, true);
    logError("Strategy execution failed", error, {
      symbol: tradingConfig.symbol,
      price,
    });
  } finally {
    tickLock = false;
  }
}
