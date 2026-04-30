import {
  appendCsvRow,
  getDataPath,
  readCsvRows,
  writeJsonFile,
} from "../repositories/file-storage.repository.js";
import {
  saveAnalysisToDatabase,
  saveMetricsToDatabase,
  saveSnapshotToDatabase,
  saveTradeToDatabase,
} from "../repositories/postgres.repository.js";
import { tradingConfig } from "../config/trading.config.js";

const tradesFilePath = getDataPath("history", "trades.csv");
const analysesFilePath = getDataPath("history", "analyses.csv");
const metricsFilePath = getDataPath("monitoring", "metrics.json");
const statusFilePath = getDataPath("monitoring", "bot-status.json");

function toNumber(value, fallback = 0) {
  const parsedValue = Number.parseFloat(`${value ?? ""}`);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number.parseFloat(`${value}`);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function toTimestamp(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const normalizedValue = `${value}`.trim();
  const numericTimestamp = /^\d+$/.test(normalizedValue)
    ? Number.parseInt(normalizedValue, 10)
    : Number.NaN;

  if (Number.isFinite(numericTimestamp)) {
    return numericTimestamp;
  }

  const dateTimestamp = Date.parse(normalizedValue);
  return Number.isFinite(dateTimestamp) ? dateTimestamp : fallback;
}

function getTradingDayKey(timestamp = Date.now()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tradingConfig.dailyResetTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

function normalizeTradeRecord(row) {
  const timestamp = toTimestamp(row.timestamp);
  const openedAt = toTimestamp(row.openedAt, timestamp);
  const closedAt = toTimestamp(row.closedAt, null);

  return {
    ...row,
    entryPrice: toNullableNumber(row.entryPrice),
    exitPrice: toNullableNumber(row.exitPrice),
    quantity: toNullableNumber(row.quantity),
    stopLoss: toNullableNumber(row.stopLoss),
    takeProfit: toNullableNumber(row.takeProfit),
    pnlUsdt: toNullableNumber(row.pnlUsdt),
    pnlBrl: toNullableNumber(row.pnlBrl),
    fees: toNumber(row.fees, 0),
    timestamp,
    openedAt,
    closedAt,
  };
}

function normalizeAnalysisRecord(row) {
  return {
    ...row,
    timestamp: toTimestamp(row.timestamp),
    decision: row.decision,
    longScore: toNullableNumber(row.longScore),
    shortScore: toNullableNumber(row.shortScore),
    close: toNullableNumber(row.close),
    emaFast: toNullableNumber(row.emaFast),
    emaSlow: toNullableNumber(row.emaSlow),
    emaTrend: toNullableNumber(row.emaTrend),
    smaTrend: toNullableNumber(row.smaTrend),
    rsi: toNullableNumber(row.rsi),
    macd: toNullableNumber(row.macd),
    macdSignal: toNullableNumber(row.macdSignal),
    macdHistogram: toNullableNumber(row.macdHistogram),
    atr: toNullableNumber(row.atr),
    atrPercent: toNullableNumber(row.atrPercent),
    volumeRatio: toNullableNumber(row.volumeRatio),
    orderBookImbalance: toNullableNumber(row.orderBookImbalance),
    candleBodyRatio: toNullableNumber(row.candleBodyRatio),
    signalCandleOpenTime: toNullableNumber(row.signalCandleOpenTime),
  };
}

function isFavorableExit(side, entryPrice, exitPrice) {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice)) {
    return false;
  }

  if (side === "LONG") {
    return exitPrice > entryPrice;
  }

  if (side === "SHORT") {
    return exitPrice < entryPrice;
  }

  return false;
}

function normalizeExitReason(reason, trade) {
  if (
    reason === "TAKE PROFIT" &&
    !isFavorableExit(trade.side, trade.entryPrice, trade.exitPrice)
  ) {
    return "ENCERRAMENTO AUTOMATICO";
  }

  return reason;
}

function createTradeHistorySummary(tradingDay) {
  return {
    daily: {
      tradingDay,
      entriesOpened: 0,
      tradesClosed: 0,
      netRealizedPnl: 0,
      positivePnl: 0,
      negativePnl: 0,
    },
    portfolio: {
      tradesClosed: 0,
      wins: 0,
      losses: 0,
      realizedPnl: 0,
      feesPaid: 0,
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
  };
}

export async function loadTradeHistory() {
  const rows = await readCsvRows(tradesFilePath, []);
  return rows.map(normalizeTradeRecord);
}

export async function loadAnalysisHistory() {
  const rows = await readCsvRows(analysesFilePath, []);
  return rows.map(normalizeAnalysisRecord);
}

export async function summarizeTradeHistory({
  symbol = tradingConfig.symbol,
  mode = tradingConfig.tradingMode,
  tradingDay = getTradingDayKey(),
} = {}) {
  const summary = createTradeHistorySummary(tradingDay);
  const trades = await loadTradeHistory();

  for (const trade of trades) {
    if (trade.symbol !== symbol || trade.mode !== mode) {
      continue;
    }

    const eventTimestamp =
      trade.action === "CLOSE"
        ? trade.closedAt || trade.timestamp
        : trade.openedAt || trade.timestamp;

    if (eventTimestamp && (!summary.activity.lastTradeAt || eventTimestamp > summary.activity.lastTradeAt)) {
      summary.activity.lastTradeAt = eventTimestamp;
    }

    if (trade.action === "OPEN") {
      if (
        eventTimestamp &&
        getTradingDayKey(eventTimestamp) === tradingDay
      ) {
        summary.daily.entriesOpened += 1;
      }

      if (!summary.activity.lastEntryAt || eventTimestamp > summary.activity.lastEntryAt) {
        summary.activity.lastEntryAt = eventTimestamp;
        summary.activity.lastEntrySide = trade.side || "NONE";
        summary.activity.lastEntryPrice = trade.entryPrice || 0;
      }

      continue;
    }

    if (trade.action !== "CLOSE") {
      continue;
    }

    summary.portfolio.tradesClosed += 1;
    summary.portfolio.realizedPnl += trade.pnlUsdt || 0;
    summary.portfolio.feesPaid += trade.fees || 0;

    if ((trade.pnlUsdt || 0) >= 0) {
      summary.portfolio.wins += 1;
    } else {
      summary.portfolio.losses += 1;
    }

    if (
      eventTimestamp &&
      getTradingDayKey(eventTimestamp) === tradingDay
    ) {
      summary.daily.tradesClosed += 1;
      summary.daily.netRealizedPnl += trade.pnlUsdt || 0;

      if ((trade.pnlUsdt || 0) > 0) {
        summary.daily.positivePnl += trade.pnlUsdt || 0;
      } else if ((trade.pnlUsdt || 0) < 0) {
        summary.daily.negativePnl += Math.abs(trade.pnlUsdt || 0);
      }
    }

    if (!summary.activity.lastExitAt || eventTimestamp > summary.activity.lastExitAt) {
      summary.activity.lastExitAt = eventTimestamp;
      summary.activity.lastExitSide = trade.side || "NONE";
      summary.activity.lastExitPrice = trade.exitPrice || 0;
      summary.activity.lastExitReason = normalizeExitReason(trade.reason || null, trade);
      summary.activity.lastExitPnlUsdt = trade.pnlUsdt || 0;
    }
  }

  return summary;
}

export async function recordAnalysis(summary) {
  const analysisRecord = {
    timestamp: new Date().toISOString(),
    symbol: tradingConfig.symbol,
    mode: tradingConfig.tradingMode,
    decision: summary.decision,
    longScore: summary.longScore,
    shortScore: summary.shortScore,
    close: summary.close,
    emaFast: summary.emaFast,
    emaSlow: summary.emaSlow,
    emaTrend: summary.emaTrend,
    smaTrend: summary.smaTrend,
    rsi: summary.rsi,
    macd: summary.macd,
    macdSignal: summary.macdSignal,
    macdHistogram: summary.macdHistogram,
    atr: summary.atr,
    atrPercent: summary.atrPercent,
    volumeRatio: summary.volumeRatio,
    orderBookImbalance: summary.orderBookImbalance,
    candleBodyRatio: summary.candleBodyRatio,
    signalCandleOpenTime: summary.signalCandleOpenTime,
  };

  await appendCsvRow(analysesFilePath, analysisRecord);
  await saveAnalysisToDatabase(analysisRecord);
}

export async function recordTrade(trade) {
  const tradeRecord = {
    timestamp: new Date().toISOString(),
    mode: trade.mode,
    symbol: trade.symbol,
    side: trade.side,
    action: trade.action,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    quantity: trade.quantity,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    pnlUsdt: trade.pnlUsdt,
    pnlBrl: trade.pnlBrl,
    fees: trade.fees,
    reason: trade.reason,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    signalCandleOpenTime: trade.signalCandleOpenTime,
    analysisDecision: trade.analysisDecision,
  };

  await appendCsvRow(tradesFilePath, tradeRecord);
  await saveTradeToDatabase(tradeRecord);
}

export async function saveMetrics(metrics) {
  await writeJsonFile(metricsFilePath, metrics);
  await saveMetricsToDatabase(metrics);
}

export async function saveStatusSnapshot(snapshot) {
  await writeJsonFile(statusFilePath, snapshot);
  await saveSnapshotToDatabase(snapshot);
}
