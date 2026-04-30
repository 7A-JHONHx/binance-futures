import { tradingConfig } from "./config/trading.config.js";
import { initializeStrategy } from "./services/strategy.service.js";
import { logError, logInfo } from "./utils/logger.js";
import { resolveStreamBaseUrl, startWebSocket } from "./websocket/ws.client.js";

function buildStartupContext() {
  return {
    modo: tradingConfig.tradingMode === "paper" ? "simulado" : "real",
    ativo: tradingConfig.symbol,
    valorOperacaoUsdt: tradingConfig.usdAmount,
    intervaloCandles: tradingConfig.candleInterval,
    apiUrl: process.env.API_URL || "n/d",
    streamUrl: resolveStreamBaseUrl(),
  };
}

export async function bootstrapLegacyStrategy() {
  await initializeStrategy();

  logInfo("Bot iniciado", buildStartupContext());
}

export function startLegacyMarketStream() {
  startWebSocket();
}

export async function startLegacyBotRuntime() {
  try {
    await bootstrapLegacyStrategy();
    startLegacyMarketStream();
  } catch (error) {
    logError("Falha ao iniciar o bot", error, {
      ativo: tradingConfig.symbol,
    });
    process.exit(1);
  }
}
