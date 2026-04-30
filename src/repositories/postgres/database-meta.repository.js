import { getDatabaseHealth } from "../../database/pg-client.js";
import { ensureDatabaseSchema, runPendingMigrations } from "../../database/migrator.js";
import { safeRead } from "./shared.js";

export { ensureDatabaseSchema, getDatabaseHealth, runPendingMigrations };

export async function getDatabaseTableCounts() {
  const rows = await safeRead(
    `
      SELECT
        (SELECT COUNT(*) FROM bot_snapshots) AS snapshots,
        (SELECT COUNT(*) FROM bot_metrics) AS metrics,
        (SELECT COUNT(*) FROM trades) AS trades,
        (SELECT COUNT(*) FROM analyses) AS analyses
    `,
    [],
    [],
    "Falha ao consultar contagem das tabelas no Postgres"
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    snapshots: Number.parseInt(row.snapshots, 10) || 0,
    metrics: Number.parseInt(row.metrics, 10) || 0,
    trades: Number.parseInt(row.trades, 10) || 0,
    analyses: Number.parseInt(row.analyses, 10) || 0,
  };
}
