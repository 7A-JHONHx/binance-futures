import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { logError, logWarn } from "./src/utils/logger.js";

const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;
const apiUrl = process.env.API_URL;

if (!apiKey || !apiSecret || !apiUrl) {
  throw new Error("Preencha o arquivo .env com API_URL, API_KEY e API_SECRET");
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
    logWarn("Falha ao buscar horario do servidor da Binance, usando horario local");
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
    logError("Falha ao buscar saldo da conta Futures", error);
    throw error;
  }
}

async function getPositionRisk(symbol) {
  try {
    return await signedRequest("GET", "/fapi/v2/positionRisk", { symbol });
  } catch (error) {
    logError("Falha ao buscar risco da posicao", error, { ativo: symbol });
    throw error;
  }
}

async function getOrder(symbol, options = {}) {
  try {
    return await signedRequest("GET", "/fapi/v1/order", {
      symbol,
      ...options,
    });
  } catch (error) {
    logError("Falha ao buscar detalhes da ordem", error, {
      ativo: symbol,
      ...options,
    });
    throw error;
  }
}

async function getOpenOrders(symbol) {
  try {
    return await signedRequest("GET", "/fapi/v1/openOrders", { symbol });
  } catch (error) {
    logError("Falha ao buscar ordens abertas", error, {
      ativo: symbol,
    });
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

    if (payload.closePosition !== undefined) {
      payload.closePosition = String(payload.closePosition);
    }

    if (payload.priceProtect !== undefined) {
      payload.priceProtect = String(payload.priceProtect);
    }

    return await signedRequest("POST", "/fapi/v1/order", payload);
  } catch (error) {
    logError("Falha ao enviar ordem na Futures", error, {
      ativo: symbol,
      quantidade: quantity,
      lado: side,
      tipo: type,
      ...options,
    });
    throw error;
  }
}

async function cancelOrder(symbol, options = {}) {
  try {
    return await signedRequest("DELETE", "/fapi/v1/order", {
      symbol,
      ...options,
    });
  } catch (error) {
    logError("Falha ao cancelar ordem", error, {
      ativo: symbol,
      ...options,
    });
    throw error;
  }
}

async function cancelAllOpenOrders(symbol) {
  try {
    return await signedRequest("DELETE", "/fapi/v1/allOpenOrders", {
      symbol,
    });
  } catch (error) {
    logError("Falha ao cancelar todas as ordens abertas", error, {
      ativo: symbol,
    });
    throw error;
  }
}

async function getExchangeInfo() {
  try {
    return await publicGet("/fapi/v1/exchangeInfo");
  } catch (error) {
    logError("Falha ao buscar informacoes da corretora", error);
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
    logError("Falha ao buscar klines da Futures", error, {
      ativo: symbol,
      intervalo: interval,
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
    logError("Falha ao buscar livro de ofertas da Futures", error, {
      ativo: symbol,
      limite: limit,
    });
    throw error;
  }
}

export default {
  getBalance,
  getCandles,
  getExchangeInfo,
  getOrder,
  getOrderBook,
  getOpenOrders,
  getPositionRisk,
  newOrder,
  cancelOrder,
  cancelAllOpenOrders,
};
