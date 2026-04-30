import { getDataPath, readJsonFile } from "../repositories/file-storage.repository.js";
import {
  getAnalysesFromDatabase,
  getDatabaseHealth,
  getLatestMetricsFromDatabase,
  getLatestSnapshotFromDatabase,
  getTradesFromDatabase,
} from "../repositories/postgres/index.js";
import { tradingConfig } from "../config/trading.config.js";
import { loadAnalysisHistory, loadTradeHistory } from "./journal.service.js";

const statusSnapshotPath = getDataPath("monitoring", "bot-status.json");
const metricsPath = getDataPath("monitoring", "metrics.json");

function toNumber(value, fallback = 0) {
  const parsedValue = Number.parseFloat(`${value ?? ""}`);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function toTimestamp(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const normalizedValue = `${value}`.trim();
  const numericTimestamp = /^\d+$/.test(normalizedValue)
    ? Number.parseInt(normalizedValue, 10)
    : Number.NaN;

  if (Number.isFinite(numericTimestamp)) {
    return numericTimestamp;
  }

  const parsedDate = Date.parse(normalizedValue);
  return Number.isFinite(parsedDate) ? parsedDate : fallback;
}

function sortByTimestampDesc(items, extractor) {
  return [...items].sort((left, right) => {
    const leftValue = extractor(left) || 0;
    const rightValue = extractor(right) || 0;
    return rightValue - leftValue;
  });
}

function sortByTimestampAsc(items, extractor) {
  return [...items].sort((left, right) => {
    const leftValue = extractor(left) || 0;
    const rightValue = extractor(right) || 0;
    return leftValue - rightValue;
  });
}

function getTradeEventTimestamp(trade) {
  return trade.closedAt || trade.openedAt || trade.timestamp || 0;
}

function normalizeTrade(trade) {
  const timestamp = toTimestamp(trade.timestamp);
  const openedAt = toTimestamp(trade.openedAt, timestamp);
  const closedAt = toTimestamp(trade.closedAt, null);

  return {
    ...trade,
    entryPrice: trade.entryPrice ?? null,
    exitPrice: trade.exitPrice ?? null,
    quantity: trade.quantity ?? null,
    stopLoss: trade.stopLoss ?? null,
    takeProfit: trade.takeProfit ?? null,
    pnlUsdt: trade.pnlUsdt ?? null,
    pnlBrl: trade.pnlBrl ?? null,
    fees: trade.fees ?? 0,
    timestamp,
    openedAt,
    closedAt,
  };
}

function normalizeAnalysis(analysis) {
  return {
    ...analysis,
    timestamp: toTimestamp(analysis.timestamp),
    longScore: analysis.longScore ?? null,
    shortScore: analysis.shortScore ?? null,
    close: analysis.close ?? null,
    rsi: analysis.rsi ?? null,
    atrPercent: analysis.atrPercent ?? null,
    volumeRatio: analysis.volumeRatio ?? null,
    orderBookImbalance: analysis.orderBookImbalance ?? null,
    signalCandleOpenTime: toTimestamp(
      analysis.signalCandleOpenTime,
      analysis.signalCandleOpenTime ?? null
    ),
  };
}

function calculateUnrealizedPnl(snapshot) {
  const position = snapshot?.position;

  if (!position?.isOpen) {
    return 0;
  }

  const latestPrice = toNumber(snapshot?.latestPrice, Number.NaN);
  const entryPrice = toNumber(position.entryPrice, Number.NaN);
  const quantity = toNumber(position.quantity, Number.NaN);

  if (
    !Number.isFinite(latestPrice) ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return 0;
  }

  if (position.side === "LONG") {
    return (latestPrice - entryPrice) * quantity;
  }

  if (position.side === "SHORT") {
    return (entryPrice - latestPrice) * quantity;
  }

  return 0;
}

function buildCharts(snapshot, metrics, trades) {
  const mode = snapshot?.mode || metrics?.mode || tradingConfig.tradingMode;
  const chartLimit = Math.max(1, tradingConfig.dashboardChartPoints);
  const baselineEquity = mode === "paper" ? tradingConfig.paperStartBalance : 0;
  const realizedPnl = toNumber(metrics?.realizedPnl, snapshot?.portfolio?.realizedPnl ?? 0);
  const unrealizedPnl = calculateUnrealizedPnl(snapshot);
  const currentNetPnl = realizedPnl + unrealizedPnl;
  const snapshotTimestamp = toTimestamp(
    snapshot?.generatedAt,
    toTimestamp(metrics?.generatedAt, Date.now())
  );
  const closedTrades = sortByTimestampAsc(
    trades.filter((trade) => trade.action === "CLOSE"),
    getTradeEventTimestamp
  ).slice(-chartLimit);

  let cumulativeClosedPnl = 0;

  const equityPoints = closedTrades.map((trade) => {
    cumulativeClosedPnl += toNumber(trade.pnlUsdt, 0);
    return {
      time: getTradeEventTimestamp(trade),
      value: baselineEquity + cumulativeClosedPnl,
      side: trade.side,
      phase: "closed",
      reason: trade.reason || null,
    };
  });

  const pnlPoints = closedTrades.map((trade) => ({
    time: getTradeEventTimestamp(trade),
    value: toNumber(trade.pnlUsdt, 0),
    cumulative: 0,
    side: trade.side,
    phase: "closed",
    reason: trade.reason || null,
  }));

  let runningCumulativePnl = 0;

  for (const point of pnlPoints) {
    runningCumulativePnl += point.value;
    point.cumulative = runningCumulativePnl;
  }

  const currentEquity = baselineEquity + currentNetPnl;
  const latestEquityPoint = {
    time: snapshotTimestamp,
    value: currentEquity,
    side: snapshot?.position?.side || "NONE",
    phase: snapshot?.position?.isOpen ? "open" : "live",
    reason: snapshot?.position?.isOpen ? "PNL_EM_ABERTO" : "SNAPSHOT_ATUAL",
  };

  if (equityPoints.length === 0) {
    equityPoints.push({
      time: snapshotTimestamp,
      value: currentEquity,
      side: snapshot?.position?.side || "NONE",
      phase: snapshot?.position?.isOpen ? "open" : "live",
      reason: snapshot?.position?.isOpen ? "PNL_EM_ABERTO" : "SEM_TRADES",
    });
  } else {
    const lastPoint = equityPoints.at(-1);

    if (
      !lastPoint ||
      lastPoint.time !== latestEquityPoint.time ||
      Math.abs(lastPoint.value - latestEquityPoint.value) > 0.000001
    ) {
      equityPoints.push(latestEquityPoint);
    } else {
      lastPoint.phase = latestEquityPoint.phase;
      lastPoint.reason = latestEquityPoint.reason;
    }
  }

  if (snapshot?.position?.isOpen) {
    pnlPoints.push({
      time: snapshotTimestamp,
      value: unrealizedPnl,
      cumulative: currentNetPnl,
      side: snapshot.position.side,
      phase: "open",
      reason: "PNL_EM_ABERTO",
    });
  } else if (pnlPoints.length === 0) {
    pnlPoints.push({
      time: snapshotTimestamp,
      value: currentNetPnl,
      cumulative: currentNetPnl,
      side: "NONE",
      phase: "live",
      reason: "SEM_TRADES",
    });
  }

  return {
    equity: {
      title:
        mode === "paper" ? "Equity simulada em tempo real" : "Equity da estrategia em tempo real",
      baseline: baselineEquity,
      current: currentEquity,
      realizedPnl,
      unrealizedPnl,
      points: equityPoints,
    },
    pnl: {
      title: "PnL em tempo real",
      current: currentNetPnl,
      realized: realizedPnl,
      unrealized: unrealizedPnl,
      points: pnlPoints,
    },
  };
}

function buildFallbackMetrics(snapshot, metrics, trades) {
  const latestTrades = trades.filter((trade) => trade.action === "CLOSE");
  const totalTrades = metrics?.totalTrades ?? latestTrades.length;
  const wins = metrics?.wins ?? latestTrades.filter((trade) => (trade.pnlUsdt || 0) >= 0).length;
  const losses =
    metrics?.losses ?? latestTrades.filter((trade) => (trade.pnlUsdt || 0) < 0).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  return {
    generatedAt: metrics?.generatedAt || new Date().toISOString(),
    mode: snapshot?.mode || metrics?.mode || tradingConfig.tradingMode,
    symbol: snapshot?.symbol || metrics?.symbol || tradingConfig.symbol,
    totalTrades,
    wins,
    losses,
    winRate,
    realizedPnl:
      metrics?.realizedPnl ??
      latestTrades.reduce((sum, trade) => sum + toNumber(trade.pnlUsdt, 0), 0),
    feesPaid:
      metrics?.feesPaid ?? latestTrades.reduce((sum, trade) => sum + toNumber(trade.fees, 0), 0),
    paperAvailableBalance: metrics?.paperAvailableBalance ?? 0,
    paperAllocatedMargin: metrics?.paperAllocatedMargin ?? 0,
    dailyTradingDay: snapshot?.daily?.tradingDay || metrics?.dailyTradingDay || null,
    dailyEntriesOpened:
      snapshot?.daily?.entriesOpened ?? metrics?.dailyEntriesOpened ?? 0,
    dailyTradesClosed:
      snapshot?.daily?.tradesClosed ?? metrics?.dailyTradesClosed ?? 0,
    dailyNetRealizedPnl:
      snapshot?.daily?.netRealizedPnl ?? metrics?.dailyNetRealizedPnl ?? 0,
    dailyPositivePnl:
      snapshot?.daily?.positivePnl ?? metrics?.dailyPositivePnl ?? 0,
    dailyNegativePnl:
      snapshot?.daily?.negativePnl ?? metrics?.dailyNegativePnl ?? 0,
    dailyTradingPaused:
      snapshot?.daily?.tradingPaused ?? metrics?.dailyTradingPaused ?? false,
    dailyPauseReason:
      snapshot?.daily?.pauseReason ?? metrics?.dailyPauseReason ?? null,
    lastEntryAt: snapshot?.activity?.lastEntryAt ?? metrics?.lastEntryAt ?? null,
    lastExitAt: snapshot?.activity?.lastExitAt ?? metrics?.lastExitAt ?? null,
    lastTradeAt: snapshot?.activity?.lastTradeAt ?? metrics?.lastTradeAt ?? null,
  };
}

function buildOverview({
  source,
  snapshot,
  metrics,
  trades,
  analyses,
  database,
  tradeHistory,
}) {
  const effectiveMetrics = buildFallbackMetrics(snapshot, metrics, tradeHistory);

  return {
    generatedAt: new Date().toISOString(),
    source,
    refreshIntervalMs: tradingConfig.dashboardRefreshMs,
    database,
    snapshot,
    metrics: effectiveMetrics,
    charts: buildCharts(snapshot, effectiveMetrics, tradeHistory),
    trades,
    analyses,
  };
}

async function loadFromFiles({
  symbol,
  mode,
  tradesLimit,
  analysesLimit,
  chartTradesLimit,
}) {
  const [snapshot, metrics, trades, analyses] = await Promise.all([
    readJsonFile(statusSnapshotPath, null),
    readJsonFile(metricsPath, null),
    loadTradeHistory(),
    loadAnalysisHistory(),
  ]);

  const normalizedTrades = trades
    .filter((trade) => trade.symbol === symbol && trade.mode === mode)
    .map(normalizeTrade);
  const sortedTrades = sortByTimestampDesc(normalizedTrades, getTradeEventTimestamp);
  const normalizedAnalyses = analyses
    .filter((analysis) => {
      const analysisSymbol = analysis.symbol || symbol;
      const analysisMode = analysis.mode || mode;
      return analysisSymbol === symbol && analysisMode === mode;
    })
    .map(normalizeAnalysis);
  const sortedAnalyses = sortByTimestampDesc(
    normalizedAnalyses,
    (analysis) => analysis.timestamp
  );

  const filteredSnapshot =
    snapshot && snapshot.symbol === symbol && snapshot.mode === mode ? snapshot : snapshot;
  const filteredMetrics =
    metrics && metrics.symbol === symbol && metrics.mode === mode ? metrics : metrics;

  return buildOverview({
    source: "arquivo",
    snapshot: filteredSnapshot,
    metrics: filteredMetrics,
    trades: sortedTrades.slice(0, tradesLimit),
    analyses: sortedAnalyses.slice(0, analysesLimit),
    tradeHistory: sortedTrades.slice(0, chartTradesLimit),
    database: getDatabaseHealth(),
  });
}

async function loadFromDatabase({
  symbol,
  mode,
  tradesLimit,
  analysesLimit,
  chartTradesLimit,
}) {
  const [snapshot, metrics, trades, analyses] = await Promise.all([
    getLatestSnapshotFromDatabase(symbol, mode),
    getLatestMetricsFromDatabase(symbol, mode),
    getTradesFromDatabase(symbol, mode, chartTradesLimit),
    getAnalysesFromDatabase(symbol, mode, analysesLimit),
  ]);

  if (!snapshot && !metrics && trades.length === 0 && analyses.length === 0) {
    return null;
  }

  const normalizedTrades = trades.map(normalizeTrade);

  return buildOverview({
    source: "postgres",
    snapshot,
    metrics,
    trades: normalizedTrades.slice(0, tradesLimit),
    analyses: analyses.map(normalizeAnalysis),
    tradeHistory: normalizedTrades,
    database: getDatabaseHealth(),
  });
}

export async function getControlCenterOverview({
  symbol = tradingConfig.symbol,
  mode = tradingConfig.tradingMode,
  tradesLimit = 20,
  analysesLimit = 30,
} = {}) {
  const chartTradesLimit = Math.max(tradesLimit, tradingConfig.dashboardChartPoints);
  const databaseOverview = await loadFromDatabase({
    symbol,
    mode,
    tradesLimit,
    analysesLimit,
    chartTradesLimit,
  });

  if (databaseOverview) {
    return databaseOverview;
  }

  return loadFromFiles({
    symbol,
    mode,
    tradesLimit,
    analysesLimit,
    chartTradesLimit,
  });
}
