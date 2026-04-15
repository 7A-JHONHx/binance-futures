import { appendCsvRow, getDataPath, writeJsonFile } from "../repositories/file-storage.repository.js";

const tradesFilePath = getDataPath("history", "trades.csv");
const analysesFilePath = getDataPath("history", "analyses.csv");
const metricsFilePath = getDataPath("monitoring", "metrics.json");
const statusFilePath = getDataPath("monitoring", "bot-status.json");

export async function recordAnalysis(summary) {
  await appendCsvRow(analysesFilePath, {
    timestamp: new Date().toISOString(),
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
  });
}

export async function recordTrade(trade) {
  await appendCsvRow(tradesFilePath, {
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
  });
}

export async function saveMetrics(metrics) {
  await writeJsonFile(metricsFilePath, metrics);
}

export async function saveStatusSnapshot(snapshot) {
  await writeJsonFile(statusFilePath, snapshot);
}
