import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { logError, logWarn } from "./src/utils/logger.js";

const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;
const apiUrl = process.env.API_URL;

if (!apiKey || !apiSecret || !apiUrl) {
  throw new Error("Fill your .env with API_URL, API_KEY and API_SECRET");
}

const http = axios.create({
  baseURL: apiUrl,
  timeout: 10000,
});

function removeUndefinedValues(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
  );
}

function signQuery(query) {
  return crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
}

async function getServerTime() {
  try {
    const response = await http.get("/fapi/v1/time");
    return response.data.serverTime;
  } catch (error) {
    logWarn("Failed to fetch Binance server time, using local time");
    return Date.now();
  }
}

async function publicGet(path, params = {}) {
  const query = new URLSearchParams(removeUndefinedValues(params)).toString();
  const url = query ? `${path}?${query}` : path;
  const response = await http.get(url);
  return response.data;
}

async function signedRequest(method, path, params = {}) {
  const timestamp = await getServerTime();
  const signedParams = removeUndefinedValues({
    ...params,
    timestamp,
  });
  const query = new URLSearchParams(signedParams).toString();
  const signature = signQuery(query);
  const url = `${path}?${query}&signature=${signature}`;

  const response = await http.request({
    method,
    url,
    headers: {
      "X-MBX-APIKEY": apiKey,
    },
  });

  return response.data;
}

async function getBalance() {
  try {
    return await signedRequest("GET", "/fapi/v2/balance");
  } catch (error) {
    logError("Failed to fetch futures balance", error);
    throw error;
  }
}

async function getPositionRisk(symbol) {
  try {
    return await signedRequest("GET", "/fapi/v2/positionRisk", { symbol });
  } catch (error) {
    logError("Failed to fetch position risk", error, { symbol });
    throw error;
  }
}

async function newOrder(symbol, quantity, side = "BUY", type = "MARKET", options = {}) {
  try {
    const payload = {
      symbol,
      side,
      type,
      quantity,
      recvWindow: 60000,
      newOrderRespType: "RESULT",
      ...options,
    };

    if (payload.reduceOnly !== undefined) {
      payload.reduceOnly = String(payload.reduceOnly);
    }

    return await signedRequest("POST", "/fapi/v1/order", payload);
  } catch (error) {
    logError("Failed to submit futures order", error, {
      symbol,
      quantity,
      side,
      type,
      ...options,
    });
    throw error;
  }
}

async function getExchangeInfo() {
  try {
    return await publicGet("/fapi/v1/exchangeInfo");
  } catch (error) {
    logError("Failed to fetch exchange info", error);
    throw error;
  }
}

async function getCandles(symbol, interval, options = {}) {
  try {
    const normalizedOptions =
      typeof options === "number" ? { limit: options } : options;

    return await publicGet("/fapi/v1/klines", {
      symbol,
      interval,
      ...normalizedOptions,
    });
  } catch (error) {
    logError("Failed to fetch futures klines", error, {
      symbol,
      interval,
      ...options,
    });
    throw error;
  }
}

async function getOrderBook(symbol, limit) {
  try {
    return await publicGet("/fapi/v1/depth", {
      symbol,
      limit,
    });
  } catch (error) {
    logError("Failed to fetch futures order book", error, {
      symbol,
      limit,
    });
    throw error;
  }
}

export default {
  getBalance,
  getCandles,
  getExchangeInfo,
  getOrderBook,
  getPositionRisk,
  newOrder,
};
