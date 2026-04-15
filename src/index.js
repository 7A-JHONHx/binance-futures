import { tradingConfig } from "./config/trading.config.js";
import { initializeStrategy } from "./services/strategy.service.js";
import { logError, logInfo } from "./utils/logger.js";
import { startWebSocket } from "./websocket/ws.client.js";

try {
  await initializeStrategy();

  logInfo("Bot started", {
    mode: tradingConfig.tradingMode,
    symbol: tradingConfig.symbol,
    usdAmount: tradingConfig.usdAmount,
    candleInterval: tradingConfig.candleInterval,
  });

  startWebSocket();
} catch (error) {
  logError("Bot startup failed", error, {
    symbol: tradingConfig.symbol,
  });
  process.exit(1);
}
