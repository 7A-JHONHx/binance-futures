import WebSocket from "ws";
import { tradingConfig } from "../config/trading.config.js";
import { handlePrice } from "../services/strategy.service.js";
import { logError, logInfo, logWarn } from "../utils/logger.js";

export function startWebSocket() {
  if (!process.env.STREAM_URL) {
    throw new Error("STREAM_URL is not configured");
  }

  const wsUrl = `${process.env.STREAM_URL}/${tradingConfig.symbol.toLowerCase()}@ticker`;
  const ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    logInfo("WebSocket connected", {
      symbol: tradingConfig.symbol,
      url: wsUrl,
    });
  });

  ws.on("message", async (data) => {
    try {
      const payload = JSON.parse(data.toString());
      const price = Number.parseFloat(payload.c);

      await handlePrice(price);
    } catch (error) {
      logError("Failed to process WebSocket message", error, {
        symbol: tradingConfig.symbol,
      });
    }
  });

  ws.on("close", () => {
    logWarn("WebSocket disconnected, reconnect scheduled", {
      delayMs: tradingConfig.reconnectDelayMs,
    });

    setTimeout(startWebSocket, tradingConfig.reconnectDelayMs);
  });

  ws.on("error", (error) => {
    logError("WebSocket error", error, {
      symbol: tradingConfig.symbol,
    });
  });

  return ws;
}
