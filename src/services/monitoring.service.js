import { tradingConfig } from "../config/trading.config.js";

export function buildStatusSnapshot({ state, latestPrice = null }) {
  return {
    generatedAt: new Date().toISOString(),
    mode: tradingConfig.tradingMode,
    symbol: tradingConfig.symbol,
    latestPrice,
    position: state.position,
    runtime: state.runtime,
    portfolio: state.portfolio,
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
  };
}
