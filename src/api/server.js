import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { tradingConfig } from "../config/trading.config.js";
import { createApp } from "./create-app.js";
import { ensureDatabaseSchema, getDatabaseHealth } from "../repositories/postgres/index.js";
import { hydrateDatabaseFromLocalFiles } from "../services/database-bootstrap.service.js";
import { logError, logInfo } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDirectory = path.join(__dirname, "public");
const app = createApp({ publicDirectory });

try {
  await ensureDatabaseSchema();
  await hydrateDatabaseFromLocalFiles();

  app.listen(tradingConfig.apiPort, () => {
    logInfo("API e painel do robo iniciados", {
      porta: tradingConfig.apiPort,
      banco: getDatabaseHealth(),
      modo: tradingConfig.tradingMode,
      ativo: tradingConfig.symbol,
    });
  });
} catch (error) {
  logError("Falha ao iniciar API e painel do robo", error, {
    porta: tradingConfig.apiPort,
  });
  process.exit(1);
}
