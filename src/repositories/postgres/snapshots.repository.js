import { safeInsert, safeRead, toIsoTimestamp } from "./shared.js";

export async function saveSnapshotToDatabase(snapshot) {
  return safeInsert(
    `
      INSERT INTO bot_snapshots (generated_at, symbol, mode, payload)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [
      toIsoTimestamp(snapshot.generatedAt),
      snapshot.symbol,
      snapshot.mode,
      JSON.stringify(snapshot),
    ],
    "Falha ao persistir snapshot no Postgres"
  );
}

export async function getLatestSnapshotFromDatabase(symbol, mode) {
  const rows = await safeRead(
    `
      SELECT payload
      FROM bot_snapshots
      WHERE symbol = $1 AND mode = $2
      ORDER BY generated_at DESC
      LIMIT 1
    `,
    [symbol, mode],
    [],
    "Falha ao consultar snapshot no Postgres"
  );

  return rows[0]?.payload || null;
}
