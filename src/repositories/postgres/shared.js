import { noteDatabaseFailure, runQuery } from "../../database/pg-client.js";
import { ensureDatabaseSchema } from "../../database/migrator.js";

export async function safeInsert(query, params, errorMessage) {
  if (!(await ensureDatabaseSchema())) {
    return false;
  }

  try {
    await runQuery(query, params);
    return true;
  } catch (error) {
    noteDatabaseFailure(errorMessage, error);
    return false;
  }
}

export async function safeRead(query, params, fallback, errorMessage) {
  if (!(await ensureDatabaseSchema())) {
    return fallback;
  }

  try {
    const result = await runQuery(query, params);
    return result?.rows ?? fallback;
  } catch (error) {
    noteDatabaseFailure(errorMessage, error);
    return fallback;
  }
}

export function toIsoTimestamp(value, fallback = new Date().toISOString()) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}
