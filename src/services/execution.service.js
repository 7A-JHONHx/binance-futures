import api from "../../api.js";
import { tradingConfig } from "../config/trading.config.js";
import { normalizeTriggerPrice } from "./market.service.js";
import { getState, saveState } from "./state.service.js";

export function isPaperTrading() {
  return tradingConfig.tradingMode === "paper";
}

export function isNativeProtectionEnabled() {
  return !isPaperTrading() && tradingConfig.exchangeProtectionEnabled;
}

function isOrderLookupNotFound(error) {
  const code = error?.response?.data?.code;
  return code === -2011 || code === -2013;
}

function buildProtectionClientOrderId(kind) {
  const prefix = kind === "STOP" ? "BFSL" : "BFTP";
  const symbolPart = tradingConfig.symbol.slice(0, 6);
  const timestampPart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${symbolPart}_${timestampPart}_${randomPart}`.slice(0, 36);
}

function getProtectionOrderSide(positionSide) {
  return positionSide === "LONG" ? "SELL" : "BUY";
}

function getStopNormalizationMode(positionSide) {
  return positionSide === "LONG" ? "floor" : "ceil";
}

function getTakeProfitNormalizationMode(positionSide) {
  return positionSide === "LONG" ? "ceil" : "floor";
}

function mapProtectionOrder(order, fallback = {}) {
  return {
    kind: fallback.kind || order?.kind || null,
    enabled: fallback.enabled ?? true,
    orderId: order?.orderId ?? fallback.orderId ?? null,
    clientOrderId:
      order?.clientOrderId ?? order?.origClientOrderId ?? fallback.clientOrderId ?? null,
    status: order?.status ?? fallback.status ?? "NONE",
    side: order?.side ?? fallback.side ?? null,
    type: order?.type ?? fallback.type ?? null,
    stopPrice: Number.parseFloat(`${order?.stopPrice ?? fallback.stopPrice ?? 0}`),
    avgPrice: Number.parseFloat(`${order?.avgPrice ?? fallback.avgPrice ?? 0}`),
    closePosition: Boolean(order?.closePosition ?? fallback.closePosition ?? false),
    workingType:
      order?.workingType ?? fallback.workingType ?? tradingConfig.protectionWorkingType,
    priceProtect:
      order?.priceProtect ?? fallback.priceProtect ?? tradingConfig.protectionPriceProtect,
    updatedAt: Number(order?.updateTime ?? fallback.updatedAt ?? Date.now()),
    lastSyncedAt: Date.now(),
  };
}

function disableProtectionOrder(orderState, fallback = {}) {
  return {
    ...orderState,
    ...fallback,
    enabled: false,
    lastSyncedAt: Date.now(),
  };
}

export function hasActiveProtectionOrder(orderState) {
  if (!orderState?.orderId) {
    return false;
  }

  return ["NEW", "PARTIALLY_FILLED"].includes(orderState.status);
}

export async function placeStopProtectionOrder({ positionSide, stopPrice }) {
  const normalizedStopPrice = await normalizeTriggerPrice(
    stopPrice,
    tradingConfig.symbol,
    getStopNormalizationMode(positionSide)
  );
  const side = getProtectionOrderSide(positionSide);
  const response = await api.newOrder(
    tradingConfig.symbol,
    undefined,
    side,
    "STOP_MARKET",
    {
      stopPrice: normalizedStopPrice,
      closePosition: true,
      workingType: tradingConfig.protectionWorkingType,
      priceProtect: tradingConfig.protectionPriceProtect,
      newClientOrderId: buildProtectionClientOrderId("STOP"),
    }
  );

  return mapProtectionOrder(response, {
    kind: "STOP",
    enabled: true,
  });
}

export async function placeTakeProfitProtectionOrder({ positionSide, stopPrice }) {
  const normalizedStopPrice = await normalizeTriggerPrice(
    stopPrice,
    tradingConfig.symbol,
    getTakeProfitNormalizationMode(positionSide)
  );
  const side = getProtectionOrderSide(positionSide);
  const response = await api.newOrder(
    tradingConfig.symbol,
    undefined,
    side,
    "TAKE_PROFIT_MARKET",
    {
      stopPrice: normalizedStopPrice,
      closePosition: true,
      workingType: tradingConfig.protectionWorkingType,
      priceProtect: tradingConfig.protectionPriceProtect,
      newClientOrderId: buildProtectionClientOrderId("TAKE_PROFIT"),
    }
  );

  return mapProtectionOrder(response, {
    kind: "TAKE_PROFIT",
    enabled: true,
  });
}

export async function cancelProtectionOrder(orderState) {
  if (!orderState?.orderId && !orderState?.clientOrderId) {
    return disableProtectionOrder(orderState || {}, {
      status: orderState?.status || "NONE",
    });
  }

  try {
    const response = await api.cancelOrder(tradingConfig.symbol, {
      orderId: orderState.orderId || undefined,
      origClientOrderId: orderState.clientOrderId || undefined,
    });

    return disableProtectionOrder(
      mapProtectionOrder(response, {
        kind: orderState.kind,
      }),
      {
        status: response?.status || "CANCELED",
      }
    );
  } catch (error) {
    if (isOrderLookupNotFound(error)) {
      return disableProtectionOrder(orderState, {
        status: "UNKNOWN",
      });
    }

    throw error;
  }
}

export async function syncProtectionOrder(orderState) {
  if (!orderState?.orderId && !orderState?.clientOrderId) {
    return orderState;
  }

  try {
    const response = await api.getOrder(tradingConfig.symbol, {
      orderId: orderState.orderId || undefined,
      origClientOrderId: orderState.clientOrderId || undefined,
    });

    return mapProtectionOrder(response, {
      kind: orderState.kind,
      enabled: !["CANCELED", "FILLED", "REJECTED", "EXPIRED"].includes(response.status),
    });
  } catch (error) {
    if (isOrderLookupNotFound(error)) {
      return disableProtectionOrder(orderState, {
        status: orderState.status === "NONE" ? "UNKNOWN" : orderState.status,
      });
    }

    throw error;
  }
}

export async function syncProtectionOrders(position) {
  const nextProtectionOrders = {
    stop: position.protectionOrders.stop,
    takeProfit: position.protectionOrders.takeProfit,
  };

  if (!isNativeProtectionEnabled()) {
    return nextProtectionOrders;
  }

  let openOrders = [];

  try {
    openOrders = await api.getOpenOrders(tradingConfig.symbol);
  } catch {
    openOrders = [];
  }

  const syncWithOpenOrders = async (orderState) => {
    const matchingOpenOrder = openOrders.find(
      (openOrder) =>
        (orderState.orderId && openOrder.orderId === orderState.orderId) ||
        (orderState.clientOrderId && openOrder.clientOrderId === orderState.clientOrderId)
    );

    if (matchingOpenOrder) {
      return mapProtectionOrder(matchingOpenOrder, {
        kind: orderState.kind,
        enabled: true,
      });
    }

    return syncProtectionOrder(orderState);
  };

  nextProtectionOrders.stop = await syncWithOpenOrders(position.protectionOrders.stop);
  nextProtectionOrders.takeProfit = await syncWithOpenOrders(position.protectionOrders.takeProfit);

  return nextProtectionOrders;
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
