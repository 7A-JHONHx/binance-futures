import { safeInsert, safeRead, toIsoTimestamp } from "./shared.js";

export async function saveMetricsToDatabase(metrics) {
  return safeInsert(
    `
      INSERT INTO bot_metrics (generated_at, symbol, mode, payload)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [
      toIsoTimestamp(metrics.generatedAt),
      metrics.symbol,
      metrics.mode,
      JSON.stringify(metrics),
    ],
    "Falha ao persistir metricas no Postgres"
  );
}

export async function getLatestMetricsFromDatabase(symbol, mode) {
  const rows = await safeRead(
    `
      SELECT payload
      FROM bot_metrics
      WHERE symbol = $1 AND mode = $2
      ORDER BY generated_at DESC
      LIMIT 1
    `,
    [symbol, mode],
    [],
    "Falha ao consultar metricas no Postgres"
  );

  return rows[0]?.payload || null;
}
