import { Pool } from "pg";
import { tradingConfig } from "../config/trading.config.js";
import { logWarn } from "../utils/logger.js";

let pool = null;
let databaseAvailable = false;
let lastDatabaseError = null;
let lastDatabaseCheckAt = null;
let lastDatabaseWarningAt = 0;

export function isDatabaseConfigured() {
  return tradingConfig.databaseEnabled && Boolean(tradingConfig.databaseUrl);
}

function warnDatabaseUnavailable(message, error) {
  const now = Date.now();

  if (now - lastDatabaseWarningAt < 60000) {
    return;
  }

  lastDatabaseWarningAt = now;

  logWarn(message, {
    erro: error?.message || "Banco indisponivel",
  });
}

function setDatabaseState({ available, error = null }) {
  databaseAvailable = available;
  lastDatabaseError = error?.message || null;
  lastDatabaseCheckAt = Date.now();
}

export function noteDatabaseFailure(message, error) {
  setDatabaseState({ available: false, error });
  warnDatabaseUnavailable(message, error);
}

export function getDatabaseHealth() {
  return {
    enabled: isDatabaseConfigured(),
    available: databaseAvailable,
    lastError: lastDatabaseError,
    lastCheckedAt: lastDatabaseCheckAt,
  };
}

export function getPool() {
  if (!isDatabaseConfigured()) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: tradingConfig.databaseUrl,
      ssl: tradingConfig.databaseSsl ? { rejectUnauthorized: false } : false,
      max: tradingConfig.databasePoolMax,
    });

    pool.on("error", (error) => {
      noteDatabaseFailure("Conexao com Postgres perdeu disponibilidade", error);
    });
  }

  return pool;
}

export async function runQuery(query, params = [], client = null) {
  const executor = client || getPool();

  if (!executor) {
    return null;
  }

  const result = await executor.query(query, params);
  setDatabaseState({ available: true });
  return result;
}

export async function withDatabaseClient(callback) {
  const currentPool = getPool();

  if (!currentPool) {
    return null;
  }

  const client = await currentPool.connect();
  setDatabaseState({ available: true });

  try {
    return await callback(client);
  } catch (error) {
    setDatabaseState({ available: false, error });
    throw error;
  } finally {
    client.release();
  }
}
