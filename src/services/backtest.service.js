import { tradingConfig } from "../config/trading.config.js";
import { appendCsvRow, getDataPath, writeJsonFile } from "../repositories/file-storage.repository.js";
import { analyzeMarketSnapshot } from "./analysis.service.js";
import { calculateOrderQuantity, getHistoricalCandles } from "./market.service.js";

function parseDateInput(value) {
  if (!value) {
    return undefined;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
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

function buildBacktestRunId(symbol, interval) {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  return `${symbol}-${interval}-${now}`;
}

function getEquity(account, position, markPrice) {
  if (!position) {
    return account.availableBalance;
  }

  return (
    account.availableBalance +
    account.allocatedMargin +
    calculateGrossPnl(position.side, position.entryPrice, markPrice, position.quantity)
  );
}

function buildSummary({ runId, options, account, trades, maxDrawdown, candlesProcessed }) {
  const totalTrades = trades.length;
  const wins = trades.filter((trade) => trade.netPnl >= 0).length;
  const losses = totalTrades - wins;
  const grossProfit = trades
    .filter((trade) => trade.netPnl > 0)
    .reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = trades
    .filter((trade) => trade.netPnl < 0)
    .reduce((sum, trade) => sum + Math.abs(trade.netPnl), 0);

  return {
    runId,
    generatedAt: new Date().toISOString(),
    mode: "backtest",
    symbol: options.symbol,
    interval: options.interval,
    candlesProcessed,
    totalTrades,
    wins,
    losses,
    winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
    netPnl: account.realizedPnl,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit,
    feesPaid: account.feesPaid,
    finalBalance: account.availableBalance,
    maxDrawdown,
    initialBalance: options.initialBalance,
    usdAmount: options.usdAmount,
  };
}

async function saveBacktestArtifacts(runId, summary, trades) {
  const summaryPath = getDataPath("backtests", runId, "summary.json");
  const tradesPath = getDataPath("backtests", runId, "trades.csv");

  await writeJsonFile(summaryPath, summary);

  for (const trade of trades) {
    await appendCsvRow(tradesPath, trade);
  }

  return {
    summaryPath,
    tradesPath,
  };
}

function maybeExitPosition(position, candle) {
  if (position.side === "LONG") {
    if (candle.high > position.highestPrice) {
      position.highestPrice = candle.high;
      const trailingStop = getTrailingStop("LONG", candle.high, position.atr);

      if (trailingStop > position.stopLoss) {
        position.stopLoss = trailingStop;
      }
    }

    if (candle.low <= position.stopLoss) {
      return {
        reason: "STOP LOSS / TRAILING",
        exitPrice: position.stopLoss,
      };
    }

    if (candle.high >= position.takeProfit) {
      return {
        reason: "TAKE PROFIT",
        exitPrice: position.takeProfit,
      };
    }
  } else {
    if (position.lowestPrice === 0 || candle.low < position.lowestPrice) {
      position.lowestPrice = candle.low;
      const trailingStop = getTrailingStop("SHORT", candle.low, position.atr);

      if (position.stopLoss === 0 || trailingStop < position.stopLoss) {
        position.stopLoss = trailingStop;
      }
    }

    if (candle.high >= position.stopLoss) {
      return {
        reason: "STOP LOSS / TRAILING",
        exitPrice: position.stopLoss,
      };
    }

    if (candle.low <= position.takeProfit) {
      return {
        reason: "TAKE PROFIT",
        exitPrice: position.takeProfit,
      };
    }
  }

  return null;
}

export async function runBacktest(rawOptions = {}) {
  const options = {
    symbol: rawOptions.symbol || tradingConfig.symbol,
    interval: rawOptions.interval || tradingConfig.candleInterval,
    limit: Number(rawOptions.limit || tradingConfig.backtestLimit),
    startTime: parseDateInput(rawOptions.start || rawOptions.startTime),
    endTime: parseDateInput(rawOptions.end || rawOptions.endTime),
    initialBalance: Number(rawOptions.initialBalance || tradingConfig.backtestInitialBalance),
    usdAmount: Number(rawOptions.usdAmount || tradingConfig.usdAmount),
  };

  const candles = await getHistoricalCandles({
    symbol: options.symbol,
    interval: options.interval,
    limit: options.limit,
    startTime: options.startTime,
    endTime: options.endTime,
  });

  const minimumCandles = Math.max(tradingConfig.trendSmaPeriod + 1, 210);

  if (candles.length <= minimumCandles + 2) {
    throw new Error("Nao ha candles historicos suficientes para o backtest");
  }

  const runId = buildBacktestRunId(options.symbol, options.interval);
  const account = {
    availableBalance: options.initialBalance,
    allocatedMargin: 0,
    realizedPnl: 0,
    feesPaid: 0,
  };
  let position = null;
  let cooldownUntil = 0;
  let lastTradeSignalCandle = null;
  let equityPeak = account.availableBalance;
  let maxDrawdown = 0;
  const trades = [];

  for (let index = minimumCandles - 1; index < candles.length - 1; index += 1) {
    const closedSlice = candles.slice(0, index + 1);
    const signalCandle = candles[index];
    const entryCandle = candles[index + 1];

    if (position) {
      const exit = maybeExitPosition(position, signalCandle);

      if (exit) {
        const grossPnl = calculateGrossPnl(
          position.side,
          position.entryPrice,
          exit.exitPrice,
          position.quantity
        );
        const closeNotional = position.quantity * exit.exitPrice;
        const closeFee = closeNotional * tradingConfig.paperFeeRate;
        const netPnl = grossPnl - closeFee - position.entryFee;

        account.allocatedMargin = Math.max(0, account.allocatedMargin - position.reservedMargin);
        account.availableBalance += position.reservedMargin + grossPnl - closeFee;
        account.realizedPnl += grossPnl - closeFee;
        account.feesPaid += closeFee;

        trades.push({
          timestamp: new Date(signalCandle.closeTime).toISOString(),
          mode: "backtest",
          symbol: options.symbol,
          side: position.side,
          action: "ROUND_TRIP",
          entryPrice: position.entryPrice,
          exitPrice: exit.exitPrice,
          quantity: position.quantity,
          stopLoss: position.stopLoss,
          takeProfit: position.takeProfit,
          pnlUsdt: netPnl,
          pnlBrl: null,
          fees: position.entryFee + closeFee,
          reason: exit.reason,
          openedAt: position.openedAt,
          closedAt: signalCandle.closeTime,
          signalCandleOpenTime: position.signalCandleOpenTime,
          analysisDecision: position.side,
        });

        position = null;
        cooldownUntil = signalCandle.closeTime + tradingConfig.cooldownMs;
      }
    }

    const equity = getEquity(account, position, signalCandle.close);
    equityPeak = Math.max(equityPeak, equity);
    if (equityPeak > 0) {
      maxDrawdown = Math.max(maxDrawdown, ((equityPeak - equity) / equityPeak) * 100);
    }

    if (position || signalCandle.closeTime < cooldownUntil) {
      continue;
    }

    const analysis = analyzeMarketSnapshot(closedSlice, { orderBookImbalance: 0 });

    if (analysis.decision === "NONE") {
      continue;
    }

    if (lastTradeSignalCandle === analysis.summary.signalCandleOpenTime) {
      continue;
    }

    if (account.availableBalance < options.usdAmount) {
      continue;
    }

    const quantity = await calculateOrderQuantity(entryCandle.open, options.usdAmount, options.symbol);
    const reservedMargin = options.usdAmount;
    const openFee = reservedMargin * tradingConfig.paperFeeRate;

    account.availableBalance -= reservedMargin + openFee;
    account.allocatedMargin += reservedMargin;
    account.realizedPnl -= openFee;
    account.feesPaid += openFee;

    const entryPrice = entryCandle.open;
    const atr = analysis.metrics.atr;
    const stops = getEntryStops(analysis.decision, entryPrice, atr);

    position = {
      side: analysis.decision,
      entryPrice,
      quantity,
      atr,
      stopLoss: stops.stopLoss,
      takeProfit: stops.takeProfit,
      highestPrice: analysis.decision === "LONG" ? entryPrice : 0,
      lowestPrice: analysis.decision === "SHORT" ? entryPrice : 0,
      reservedMargin,
      entryFee: openFee,
      openedAt: entryCandle.openTime,
      signalCandleOpenTime: analysis.summary.signalCandleOpenTime,
    };

    lastTradeSignalCandle = analysis.summary.signalCandleOpenTime;
  }

  if (position) {
    const lastCandle = candles.at(-1);
    const grossPnl = calculateGrossPnl(
      position.side,
      position.entryPrice,
      lastCandle.close,
      position.quantity
    );
    const closeNotional = position.quantity * lastCandle.close;
    const closeFee = closeNotional * tradingConfig.paperFeeRate;
    const netPnl = grossPnl - closeFee - position.entryFee;

    account.allocatedMargin = Math.max(0, account.allocatedMargin - position.reservedMargin);
    account.availableBalance += position.reservedMargin + grossPnl - closeFee;
    account.realizedPnl += grossPnl - closeFee;
    account.feesPaid += closeFee;

    trades.push({
      timestamp: new Date(lastCandle.closeTime).toISOString(),
      mode: "backtest",
      symbol: options.symbol,
      side: position.side,
      action: "ROUND_TRIP",
      entryPrice: position.entryPrice,
      exitPrice: lastCandle.close,
      quantity: position.quantity,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      pnlUsdt: netPnl,
      pnlBrl: null,
      fees: position.entryFee + closeFee,
      reason: "FINAL_CANDLE_CLOSE",
      openedAt: position.openedAt,
      closedAt: lastCandle.closeTime,
      signalCandleOpenTime: position.signalCandleOpenTime,
      analysisDecision: position.side,
    });
  }

  const summary = buildSummary({
    runId,
    options,
    account,
    trades,
    maxDrawdown,
    candlesProcessed: candles.length,
  });
  const artifacts = await saveBacktestArtifacts(runId, summary, trades);

  return {
    summary,
    trades,
    artifacts,
  };
}
