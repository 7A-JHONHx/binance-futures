import { tradingConfig } from "../config/trading.config.js";

export function buildStatusSnapshot({ state, latestPrice = null }) {
  return {
    generatedAt: new Date().toISOString(),
    mode: tradingConfig.tradingMode,
    symbol: tradingConfig.symbol,
    latestPrice,
    position: state.position,
    runtime: state.runtime,
    activity: state.activity,
    portfolio: state.portfolio,
    daily: state.daily,
    analysis: state.analysis,
  };
}

export function buildPerformanceMetrics({ state }) {
  const totalTrades = state.portfolio.tradesClosed;
  const wins = state.portfolio.wins;
  const losses = state.portfolio.losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  return {
    generatedAt: new Date().toISOString(),
    mode: tradingConfig.tradingMode,
    symbol: tradingConfig.symbol,
    totalTrades,
    wins,
    losses,
    winRate,
    realizedPnl: state.portfolio.realizedPnl,
    feesPaid: state.portfolio.feesPaid,
    paperAvailableBalance: state.portfolio.paperAvailableBalance,
    paperAllocatedMargin: state.portfolio.paperAllocatedMargin,
    dailyTradingDay: state.daily.tradingDay,
    dailyEntriesOpened: state.daily.entriesOpened,
    dailyTradesClosed: state.daily.tradesClosed,
    dailyNetRealizedPnl: state.daily.netRealizedPnl,
    dailyPositivePnl: state.daily.positivePnl,
    dailyNegativePnl: state.daily.negativePnl,
    dailyTradingPaused: state.daily.tradingPaused,
    dailyPauseReason: state.daily.pauseReason,
    lastEntryAt: state.activity.lastEntryAt,
    lastExitAt: state.activity.lastExitAt,
    lastTradeAt: state.activity.lastTradeAt,
  };
}
