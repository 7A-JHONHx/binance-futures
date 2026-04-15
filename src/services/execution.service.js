import api from "../../api.js";
import { tradingConfig } from "../config/trading.config.js";
import { getState, saveState } from "./state.service.js";

export function isPaperTrading() {
  return tradingConfig.tradingMode === "paper";
}

export async function executeEntryOrder({ side, quantity, price, reservedMargin }) {
  if (!isPaperTrading()) {
    const orderSide = side === "LONG" ? "BUY" : "SELL";
    return api.newOrder(tradingConfig.symbol, quantity, orderSide, "MARKET");
  }

  const state = getState();
  const openFee = reservedMargin * tradingConfig.paperFeeRate;

  state.portfolio.paperAvailableBalance -= reservedMargin + openFee;
  state.portfolio.paperAllocatedMargin += reservedMargin;
  state.portfolio.feesPaid += openFee;
  state.portfolio.realizedPnl -= openFee;
  await saveState();

  return {
    avgPrice: String(price),
    executedQty: String(quantity),
    paperFee: openFee,
    simulated: true,
  };
}

export async function executeExitOrder({ side, quantity, price, entryPrice, reservedMargin }) {
  if (!isPaperTrading()) {
    const orderSide = side === "LONG" ? "SELL" : "BUY";
    const result = await api.newOrder(tradingConfig.symbol, quantity, orderSide, "MARKET", {
      reduceOnly: true,
    });

    return {
      ...result,
      paperFee: 0,
    };
  }

  const state = getState();
  const grossPnl =
    side === "LONG" ? (price - entryPrice) * quantity : (entryPrice - price) * quantity;
  const exitNotional = quantity * price;
  const closeFee = exitNotional * tradingConfig.paperFeeRate;
  const netPnl = grossPnl - closeFee;

  state.portfolio.paperAllocatedMargin = Math.max(
    0,
    state.portfolio.paperAllocatedMargin - reservedMargin
  );
  state.portfolio.paperAvailableBalance += reservedMargin + netPnl;
  state.portfolio.realizedPnl += netPnl;
  state.portfolio.feesPaid += closeFee;
  state.portfolio.tradesClosed += 1;

  if (netPnl >= 0) {
    state.portfolio.wins += 1;
  } else {
    state.portfolio.losses += 1;
  }

  await saveState();

  return {
    avgPrice: String(price),
    executedQty: String(quantity),
    paperFee: closeFee,
    simulated: true,
  };
}
