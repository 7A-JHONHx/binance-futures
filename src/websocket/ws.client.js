import WebSocket from "ws";
import { tradingConfig } from "../config/trading.config.js";
import { handlePrice } from "../services/strategy.service.js";
import { logError, logInfo, logWarn } from "../utils/logger.js";

const MAINNET_STREAM_BASE_URL = "wss://fstream.binance.com/ws";
const TESTNET_STREAM_BASE_URL = "wss://stream.binancefuture.com/ws";

function normalizeStreamBaseUrl(value) {
  const normalizedValue = `${value ?? ""}`.trim().replace(/\/+$/, "");

  if (!normalizedValue) {
    return "";
  }

  return normalizedValue.endsWith("/ws") ? normalizedValue : `${normalizedValue}/ws`;
}

function isTestnetRestApiUrl(value) {
  const normalizedValue = `${value ?? ""}`.toLowerCase();
  return (
    normalizedValue.includes("testnet.binancefuture.com") ||
    normalizedValue.includes("demo-fapi.binance.com")
  );
}

function isMainnetUsdMStreamUrl(value) {
  return `${value ?? ""}`.toLowerCase().includes("fstream.binance.com");
}

export function resolveStreamBaseUrl() {
  const apiUrl = process.env.API_URL;
  const configuredStreamUrl = normalizeStreamBaseUrl(process.env.STREAM_URL);
  const fallbackStreamUrl = normalizeStreamBaseUrl(
    isTestnetRestApiUrl(apiUrl) ? TESTNET_STREAM_BASE_URL : MAINNET_STREAM_BASE_URL
  );

  if (!configuredStreamUrl) {
    return fallbackStreamUrl;
  }

  if (isTestnetRestApiUrl(apiUrl) && isMainnetUsdMStreamUrl(configuredStreamUrl)) {
    logWarn("STREAM_URL de producao detectado com API_URL de testnet, ajustando stream automaticamente", {
      apiUrl,
      streamUrlConfigurado: configuredStreamUrl,
      streamUrlAplicado: fallbackStreamUrl,
    });
    return fallbackStreamUrl;
  }

  return configuredStreamUrl;
}

export function startWebSocket() {
  const streamBaseUrl = resolveStreamBaseUrl();

  if (!streamBaseUrl) {
    throw new Error("Nao foi possivel resolver o STREAM_URL para o WebSocket");
  }

  const wsUrl = `${streamBaseUrl}/${tradingConfig.symbol.toLowerCase()}@ticker`;
  const ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    logInfo("WebSocket conectado", {
      ativo: tradingConfig.symbol,
      url: wsUrl,
    });
  });

  ws.on("message", async (data) => {
    try {
      const payload = JSON.parse(data.toString());
      const price = Number.parseFloat(payload.c);

      await handlePrice(price);
    } catch (error) {
      logError("Falha ao processar mensagem do WebSocket", error, {
        ativo: tradingConfig.symbol,
      });
    }
  });

  ws.on("close", () => {
    logWarn("WebSocket desconectado, reconexao agendada", {
      atrasoMs: tradingConfig.reconnectDelayMs,
    });

    setTimeout(startWebSocket, tradingConfig.reconnectDelayMs);
  });

  ws.on("error", (error) => {
    logError("Erro no WebSocket", error, {
      ativo: tradingConfig.symbol,
    });
  });

  return ws;
}
