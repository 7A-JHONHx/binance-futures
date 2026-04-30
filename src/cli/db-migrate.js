import "dotenv/config";
import { getDatabaseHealth, runPendingMigrations } from "../repositories/postgres/index.js";
import { logError, logInfo, logWarn } from "../utils/logger.js";

const migrated = await runPendingMigrations({ force: true });

if (!migrated) {
  const database = getDatabaseHealth();

  if (!database.enabled) {
    logWarn("Migrations SQL ignoradas porque o Postgres esta desativado");
    process.exit(0);
  }

  logError("Falha ao aplicar migrations SQL", new Error(database.lastError || "Banco indisponivel"));
  process.exit(1);
}

logInfo("Migrations SQL concluidas", {
  banco: getDatabaseHealth(),
});
