import axios from "axios";
import api from "../../api.js";
import { tradingConfig } from "../config/trading.config.js";
import { logError, logWarn } from "../utils/logger.js";

const symbolRulesCache = new Map();

function getPrecision(step) {
  const normalized = String(step);

  if (!normalized.includes(".")) {
    return 0;
  }

  return normalized.replace(/0+$/, "").split(".")[1].length;
}

function roundToStep(value, step, mode = "floor") {
  const stepNumber = Number(step);

  if (!Number.isFinite(stepNumber) || stepNumber <= 0) {
    return value;
  }

  const precision = getPrecision(stepNumber);
  const factor = 10 ** precision;
  const normalizedValue = Math.round(value * factor);
  const normalizedStep = Math.round(stepNumber * factor);
  const roundedUnits =
    mode === "ceil"
      ? Math.ceil(normalizedValue / normalizedStep)
      : Math.floor(normalizedValue / normalizedStep);

  return Number(((roundedUnits * normalizedStep) / factor).toFixed(precision));
}

function normalizePositionSide(position) {
  const amount = Number.parseFloat(position.positionAmt);

  if (position.positionSide === "SHORT" || amount < 0) {
    return "SHORT";
  }

  return "LONG";
}

function parseCandle(candle) {
  return {
    openTime: Number(candle[0]),
    open: Number.parseFloat(candle[1]),
    high: Number.parseFloat(candle[2]),
    low: Number.parseFloat(candle[3]),
    close: Number.parseFloat(candle[4]),
    volume: Number.parseFloat(candle[5]),
    closeTime: Number(candle[6]),
  };
}

export async function getUSDTBRL() {
  try {
    const response = await axios.get(
      "https://api.binance.com/api/v3/ticker/price?symbol=USDTBRL"
    );

    return Number.parseFloat(response.data.price);
  } catch (error) {
    logWarn("Failed to fetch USDTBRL, using fallback", {
      fallback: tradingConfig.defaultUsdtBrl,
    });
    return tradingConfig.defaultUsdtBrl;
  }
}

export async function getUSDTBalance() {
  try {
    const balances = await api.getBalance();
    const usdtBalance = balances.find((balance) => balance.asset === "USDT");

    if (!usdtBalance) {
      logWarn("USDT balance not found");
      return 0;
    }

    return Number.parseFloat(usdtBalance.availableBalance);
  } catch (error) {
    logError("Failed to fetch USDT balance", error);
    return 0;
  }
}

export async function getCandles(
  symbol = tradingConfig.symbol,
  interval = tradingConfig.candleInterval,
  limit = tradingConfig.candleLimit
) {
  try {
    const candles = await api.getCandles(symbol, interval, limit);
    return candles.map(parseCandle);
  } catch (error) {
    logError("Failed to fetch candles", error, {
      symbol,
      interval,
      limit,
    });
    throw error;
  }
}

export async function getHistoricalCandles({
  symbol = tradingConfig.symbol,
  interval = tradingConfig.candleInterval,
  limit = tradingConfig.backtestLimit,
  startTime,
  endTime,
} = {}) {
  const batchSize = Math.min(limit, 1000);
  const allCandles = [];
  let currentStartTime = startTime;

  while (allCandles.length < limit) {
    const response = await api.getCandles(symbol, interval, {
      limit: Math.min(batchSize, limit - allCandles.length),
      startTime: currentStartTime,
      endTime,
    });

    if (!response.length) {
      break;
    }

    const parsedBatch = response.map(parseCandle);
    allCandles.push(...parsedBatch);

    if (parsedBatch.length < batchSize) {
      break;
    }

    const lastCandle = parsedBatch.at(-1);
    currentStartTime = lastCandle.openTime + 1;
  }

  return allCandles.slice(0, limit);
}

export async function getOrderBookSnapshot(
  symbol = tradingConfig.symbol,
  limit = tradingConfig.orderBookLevels
) {
  try {
    const snapshot = await api.getOrderBook(symbol, limit);

    return {
      lastUpdateId: snapshot.lastUpdateId,
      bids: snapshot.bids.map(([price, quantity]) => ({
        price: Number.parseFloat(price),
        quantity: Number.parseFloat(quantity),
      })),
      asks: snapshot.asks.map(([price, quantity]) => ({
        price: Number.parseFloat(price),
        quantity: Number.parseFloat(quantity),
      })),
    };
  } catch (error) {
    logError("Failed to fetch order book", error, {
      symbol,
      limit,
    });
    throw error;
  }
}

export async function getSymbolRules(symbol = tradingConfig.symbol) {
  if (symbolRulesCache.has(symbol)) {
    return symbolRulesCache.get(symbol);
  }

  const exchangeInfo = await api.getExchangeInfo();
  const symbolInfo = exchangeInfo.symbols.find((item) => item.symbol === symbol);

  if (!symbolInfo) {
    throw new Error(`Trading rules not found for symbol ${symbol}`);
  }

  const lotSize =
    symbolInfo.filters.find((filter) => filter.filterType === "MARKET_LOT_SIZE") ||
    symbolInfo.filters.find((filter) => filter.filterType === "LOT_SIZE");
  const minNotionalFilter = symbolInfo.filters.find(
    (filter) => filter.filterType === "MIN_NOTIONAL"
  );

  const rules = {
    minQty: Number.parseFloat(lotSize?.minQty || "0"),
    maxQty: Number.parseFloat(lotSize?.maxQty || "0"),
    stepSize: Number.parseFloat(lotSize?.stepSize || "0.001"),
    minNotional: Number.parseFloat(minNotionalFilter?.notional || "5"),
  };

  symbolRulesCache.set(symbol, rules);
  return rules;
}

export async function calculateOrderQuantity(
  price,
  usdAmount = tradingConfig.usdAmount,
  symbol = tradingConfig.symbol
) {
  const rules = await getSymbolRules(symbol);
  let quantity = roundToStep(usdAmount / price, rules.stepSize, "floor");

  if (quantity < rules.minQty) {
    quantity = rules.minQty;
  }

  if (quantity * price < rules.minNotional) {
    quantity = roundToStep(rules.minNotional / price, rules.stepSize, "ceil");
  }

  if (rules.maxQty > 0 && quantity > rules.maxQty) {
    quantity = rules.maxQty;
  }

  return quantity;
}

export async function getOpenPosition(symbol = tradingConfig.symbol) {
  try {
    const positions = await api.getPositionRisk(symbol);
    const activePosition = positions.find((position) => {
      if (position.symbol !== symbol) {
        return false;
      }

      return Math.abs(Number.parseFloat(position.positionAmt)) > 0;
    });

    if (!activePosition) {
      return null;
    }

    return {
      symbol: activePosition.symbol,
      side: normalizePositionSide(activePosition),
      quantity: Math.abs(Number.parseFloat(activePosition.positionAmt)),
      entryPrice: Number.parseFloat(activePosition.entryPrice),
      markPrice: Number.parseFloat(activePosition.markPrice),
      unrealizedProfit: Number.parseFloat(activePosition.unRealizedProfit),
      updateTime: Number(activePosition.updateTime),
    };
  } catch (error) {
    logError("Failed to fetch open position", error, { symbol });
    throw error;
  }
}
