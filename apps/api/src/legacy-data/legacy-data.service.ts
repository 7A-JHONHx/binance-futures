import { Injectable } from "@nestjs/common";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import type {
  DashboardOverviewAnalysis,
  DashboardOverviewTrade,
} from "@binance-futures/shared";

type JsonRecord = Record<string, unknown>;

function resolveDataRoot() {
  const candidates = [
    process.env.BINANCE_FUTURES_ROOT ? path.join(process.env.BINANCE_FUTURES_ROOT, "data") : null,
    process.env.INIT_CWD ? path.join(process.env.INIT_CWD, "data") : null,
    path.join(process.cwd(), "data"),
    path.resolve(process.cwd(), "../../data"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? path.resolve(process.cwd(), "../../data");
}

@Injectable()
export class LegacyDataService {
  private readonly dataRoot = resolveDataRoot();
  private readonly monitoringRoot = path.join(this.dataRoot, "monitoring");
  private readonly historyRoot = path.join(this.dataRoot, "history");

  async readSnapshot(symbol: string, mode: string): Promise<Record<string, unknown> | null> {
    const snapshot = await this.readJson(path.join(this.monitoringRoot, "bot-status.json"));

    if (!snapshot) {
      return null;
    }

    const snapshotSymbol = String(snapshot.symbol ?? symbol);
    const snapshotMode = String(snapshot.mode ?? mode);

    if (snapshotSymbol !== symbol || snapshotMode !== mode) {
      return null;
    }

    return snapshot;
  }

  async readMetrics(symbol: string, mode: string): Promise<Record<string, unknown> | null> {
    const metrics = await this.readJson(path.join(this.monitoringRoot, "metrics.json"));

    if (!metrics) {
      return null;
    }

    const metricsSymbol = String(metrics.symbol ?? symbol);
    const metricsMode = String(metrics.mode ?? mode);

    if (metricsSymbol !== symbol || metricsMode !== mode) {
      return null;
    }

    return metrics;
  }

  async readTrades(symbol: string, mode: string, limit = 20): Promise<DashboardOverviewTrade[]> {
    const rows = await this.readCsvRows(path.join(this.historyRoot, "trades.csv"));
    const trades = rows
      .filter((row) => {
        const rowSymbol = this.toStringValue(row.symbol, symbol);
        const rowMode = this.toStringValue(row.mode, mode);
        return rowSymbol === symbol && rowMode === mode;
      })
      .map((row) => ({
        symbol: this.toStringValue(row.symbol, symbol),
        mode: this.toStringValue(row.mode, mode),
        timestamp: this.getTimestampField(row),
        openedAt: this.toTimestamp(row.openedAt, this.getTimestampField(row)),
        closedAt: this.toTimestamp(row.closedAt),
        side: this.toStringValue(row.side, "NONE"),
        action: this.toStringValue(row.action, "UNKNOWN"),
        entryPrice: this.toNullableNumber(row.entryPrice),
        exitPrice: this.toNullableNumber(row.exitPrice),
        quantity: this.toNullableNumber(row.quantity),
        pnlUsdt: this.toNullableNumber(row.pnlUsdt),
        reason: this.toStringValue(row.reason, null),
      }));

    return this.sortTradesDesc(trades).slice(0, limit);
  }

  async readAnalyses(symbol: string, mode: string, limit = 30): Promise<DashboardOverviewAnalysis[]> {
    const rows = await this.readCsvRows(path.join(this.historyRoot, "analyses.csv"));
    const analyses = rows.map((row) => ({
      symbol,
      mode,
      timestamp: this.getTimestampField(row),
      decision: this.toStringValue(row.decision, "NONE"),
      longScore: this.toNullableNumber(row.longScore),
      shortScore: this.toNullableNumber(row.shortScore),
      close: this.toNullableNumber(row.close),
      rsi: this.toNullableNumber(row.rsi),
      macd: this.toNullableNumber(row.macd),
      macdSignal: this.toNullableNumber(row.macdSignal),
      macdHistogram: this.toNullableNumber(row.macdHistogram),
      atrPercent: this.toNullableNumber(row.atrPercent),
      volumeRatio: this.toNullableNumber(row.volumeRatio),
      orderBookImbalance: this.toNullableNumber(row.orderBookImbalance),
      candleBodyRatio: this.toNullableNumber(row.candleBodyRatio),
    }));

    return this.sortAnalysesDesc(analyses).slice(0, limit);
  }

  private async readJson(filePath: string): Promise<JsonRecord | null> {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return JSON.parse(content) as JsonRecord;
    } catch {
      return null;
    }
  }

  private sortTradesDesc(trades: DashboardOverviewTrade[]) {
    return [...trades].sort((left, right) => {
      const leftTime = Number(left.closedAt ?? left.openedAt ?? left.timestamp ?? 0);
      const rightTime = Number(right.closedAt ?? right.openedAt ?? right.timestamp ?? 0);
      return rightTime - leftTime;
    });
  }

  private sortAnalysesDesc(analyses: DashboardOverviewAnalysis[]) {
    return [...analyses].sort((left, right) => {
      const leftTime = Number(left.timestamp ?? 0);
      const rightTime = Number(right.timestamp ?? 0);
      return rightTime - leftTime;
    });
  }

  private async readCsvRows(filePath: string): Promise<Record<string, string>[]> {
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

      const headers = this.parseCsvLine(headerLine);

      return lines.slice(1).map((line) => {
        const values = this.parseCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      });
    } catch {
      return [];
    }
  }

  private parseCsvLine(line: string) {
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

  private getTimestampField(row: Record<string, string>) {
    return this.toTimestamp(row.timestamp ?? row["\uFEFFtimestamp"]);
  }

  private toTimestamp(value?: string | null, fallback: string | number | null = null) {
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

  private toNullableNumber(value?: string | null) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const parsed = Number.parseFloat(`${value}`);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toStringValue<T extends string | null>(value: unknown, fallback: T) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    return String(value) as Exclude<T, null> | string;
  }
}
