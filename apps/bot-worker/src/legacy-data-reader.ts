import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import type { LegacyAnalysisRecord, LegacyTradeRecord } from "./types.js";
import { workerConfig } from "./config.js";
import { resolveRepoPath } from "./repo-paths.js";

function resolveDataRoot() {
  const candidates = [
    process.env.BINANCE_FUTURES_ROOT ? path.join(process.env.BINANCE_FUTURES_ROOT, "data") : null,
    process.env.INIT_CWD ? path.join(process.env.INIT_CWD, "data") : null,
    resolveRepoPath("data"),
    path.join(process.cwd(), "data"),
    path.resolve(process.cwd(), "../../data"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? resolveRepoPath("data");
}

const dataRoot = resolveDataRoot();
const monitoringRoot = path.join(dataRoot, "monitoring");
const historyRoot = path.join(dataRoot, "history");

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseFloat(`${value}`);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTimestamp(value: unknown, fallback: number | null = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const normalized = `${value}`.trim();
  const numeric = /^\d+$/.test(normalized) ? Number.parseInt(normalized, 10) : Number.NaN;

  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const dateValue = Date.parse(normalized);
  return Number.isFinite(dateValue) ? dateValue : fallback;
}

function toStringValue(value: unknown, fallback: string | null = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        currentValue += '"';
        index += 1;
        continue;
      }

      insideQuotes = !insideQuotes;
      continue;
    }

    if (character === "," && !insideQuotes) {
      values.push(currentValue);
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue);
  return values;
}

async function readCsvRows(filePath: string) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    if (lines.length === 0) {
      return [];
    }

    const headerLine = lines[0];

    if (!headerLine) {
      return [];
    }

    const headers = parseCsvLine(headerLine);

    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
  } catch {
    return [];
  }
}

function normalizeTradeRecord(row: Record<string, string>): LegacyTradeRecord {
  const timestamp = toTimestamp(row.timestamp ?? row["\uFEFFtimestamp"]);

  return {
    symbol: toStringValue(row.symbol, workerConfig.symbol) ?? workerConfig.symbol,
    mode: toStringValue(row.mode, workerConfig.mode) ?? workerConfig.mode,
    timestamp,
    side: toStringValue(row.side, "NONE") ?? "NONE",
    action: toStringValue(row.action, "UNKNOWN") ?? "UNKNOWN",
    entryPrice: toNullableNumber(row.entryPrice),
    exitPrice: toNullableNumber(row.exitPrice),
    quantity: toNullableNumber(row.quantity),
    stopLoss: toNullableNumber(row.stopLoss),
    takeProfit: toNullableNumber(row.takeProfit),
    pnlUsdt: toNullableNumber(row.pnlUsdt),
    pnlBrl: toNullableNumber(row.pnlBrl),
    fees: toNullableNumber(row.fees),
    reason: toStringValue(row.reason, null),
    openedAt: toTimestamp(row.openedAt, timestamp),
    closedAt: toTimestamp(row.closedAt, null),
    signalCandleOpenTime: toNullableNumber(row.signalCandleOpenTime),
    analysisDecision: toStringValue(row.analysisDecision, null),
  };
}

function normalizeAnalysisRecord(row: Record<string, string>): LegacyAnalysisRecord {
  return {
    symbol: workerConfig.symbol,
    mode: workerConfig.mode,
    timestamp: toTimestamp(row.timestamp ?? row["\uFEFFtimestamp"]),
    decision: toStringValue(row.decision, "NONE") ?? "NONE",
    longScore: toNullableNumber(row.longScore),
    shortScore: toNullableNumber(row.shortScore),
    close: toNullableNumber(row.close),
    emaFast: toNullableNumber(row.emaFast),
    emaSlow: toNullableNumber(row.emaSlow),
    emaTrend: toNullableNumber(row.emaTrend),
    smaTrend: toNullableNumber(row.smaTrend),
    rsi: toNullableNumber(row.rsi),
    macd: toNullableNumber(row.macd),
    macdSignal: toNullableNumber(row.macdSignal),
    macdHistogram: toNullableNumber(row.macdHistogram),
    atr: toNullableNumber(row.atr),
    atrPercent: toNullableNumber(row.atrPercent),
    volumeRatio: toNullableNumber(row.volumeRatio),
    orderBookImbalance: toNullableNumber(row.orderBookImbalance),
    candleBodyRatio: toNullableNumber(row.candleBodyRatio),
    signalCandleOpenTime: toNullableNumber(row.signalCandleOpenTime),
  };
}

export async function readSnapshotFile() {
  try {
    const content = await fs.readFile(path.join(monitoringRoot, "bot-status.json"), "utf8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function readMetricsFile() {
  try {
    const content = await fs.readFile(path.join(monitoringRoot, "metrics.json"), "utf8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function readTradeHistory() {
  const rows = await readCsvRows(path.join(historyRoot, "trades.csv"));
  return rows.map(normalizeTradeRecord);
}

export async function readAnalysisHistory() {
  const rows = await readCsvRows(path.join(historyRoot, "analyses.csv"));
  return rows.map(normalizeAnalysisRecord);
}
