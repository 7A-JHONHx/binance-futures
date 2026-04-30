import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { isDatabaseConfigured, noteDatabaseFailure, withDatabaseClient } from "./pg-client.js";
import { logInfo } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDirectory = path.resolve(__dirname, "../../database/migrations");
const migrationLockKey = 420042;

let schemaReady = null;

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function listMigrationFiles() {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => ({
      name: entry.name,
      path: path.join(migrationsDirectory, entry.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function getAppliedMigrationNames(client) {
  const result = await client.query(`
    SELECT name
    FROM schema_migrations
    ORDER BY name ASC
  `);

  return new Set(result.rows.map((row) => row.name));
}

async function applyPendingMigrations() {
  return withDatabaseClient(async (client) => {
    await client.query("SELECT pg_advisory_lock($1)", [migrationLockKey]);

    try {
      await client.query("BEGIN");
      await ensureMigrationsTable(client);

      const migrationFiles = await listMigrationFiles();
      const appliedMigrations = await getAppliedMigrationNames(client);
      const appliedNow = [];

      for (const migration of migrationFiles) {
        if (appliedMigrations.has(migration.name)) {
          continue;
        }

        const sql = await readFile(migration.path, "utf8");

        if (sql.trim()) {
          await client.query(sql);
        }

        await client.query(
          `
            INSERT INTO schema_migrations (name)
            VALUES ($1)
          `,
          [migration.name]
        );

        appliedNow.push(migration.name);
      }

      await client.query("COMMIT");

      logInfo("Schema do Postgres pronta para monitoramento", {
        banco: "Postgres",
        migrationsAplicadas: appliedNow.length,
        versoes: appliedNow,
      });

      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [migrationLockKey]);
    }
  });
}

export async function runPendingMigrations({ force = false } = {}) {
  if (!isDatabaseConfigured()) {
    return false;
  }

  if (force || !schemaReady) {
    schemaReady = (async () => {
      try {
        return await applyPendingMigrations();
      } catch (error) {
        noteDatabaseFailure("Falha ao preparar schema do Postgres", error);
        schemaReady = null;
        return false;
      }
    })();
  }

  return schemaReady;
}

export async function ensureDatabaseSchema() {
  return runPendingMigrations();
}
