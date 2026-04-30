import "dotenv/config";
import { logError } from "./logger.js";
import { getRepoRoot } from "./repo-paths.js";
import { TradingEngineService } from "./trading-engine.service.js";

async function bootstrap() {
  process.env.BINANCE_FUTURES_ROOT ||= getRepoRoot();

  const tradingEngine = new TradingEngineService();
  await tradingEngine.bootstrap();
  await tradingEngine.start();

  const shutdown = async () => {
    await tradingEngine.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  logError("falha ao iniciar o bot-worker", {
    error: error instanceof Error ? error.message : "erro desconhecido",
  });
  process.exit(1);
});
