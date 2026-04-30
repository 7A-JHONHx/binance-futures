import { PrismaClient, type Prisma } from "@prisma/client";
import {
  readAnalysisHistory,
  readMetricsFile,
  readSnapshotFile,
  readTradeHistory,
} from "./legacy-data-reader.js";
import { logError, logInfo, logWarn } from "./logger.js";
import { loadSyncState, saveSyncState } from "./runtime-state.js";
import type {
  LegacyAnalysisRecord,
  LegacyTradeRecord,
  SyncState,
} from "./types.js";
import { workerConfig } from "./config.js";

function toDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = new Date(typeof value === "number" ? value : String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toTimestamp(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const numeric = Number.parseInt(String(value), 10);

  if (Number.isFinite(numeric) && `${numeric}` === String(value)) {
    return numeric;
  }

  const dateValue = Date.parse(String(value));
  return Number.isFinite(dateValue) ? dateValue : null;
}

type Watermarks = SyncState;

export class DatabaseSyncService {
  private readonly prisma = new PrismaClient();
  private syncState: SyncState = {
    snapshotGeneratedAt: null,
    metricsGeneratedAt: null,
    latestTradeTimestamp: null,
    latestAnalysisTimestamp: null,
  };

  async start() {
    if (!workerConfig.databaseEnabled) {
      logWarn("DATABASE_URL ausente, sincronizacao oficial desativada");
      return false;
    }

    try {
      await this.prisma.$connect();
      this.syncState = await this.mergeStateWithDatabase(await loadSyncState());
      logInfo("Conexao com Postgres/Prisma pronta", {
        symbol: workerConfig.symbol,
        mode: workerConfig.mode,
        intervaloMs: workerConfig.syncIntervalMs,
      });
      return true;
    } catch (error) {
      logError("Falha ao conectar o bot-worker ao Postgres", {
        error: error instanceof Error ? error.message : "erro desconhecido",
      });
      return false;
    }
  }

  async stop() {
    await this.prisma.$disconnect();
  }

  async syncOnce() {
    const [snapshot, metrics, trades, analyses] = await Promise.all([
      readSnapshotFile(),
      readMetricsFile(),
      readTradeHistory(),
      readAnalysisHistory(),
    ]);

    let importedSnapshots = 0;
    let importedMetrics = 0;
    let importedTrades = 0;
    let importedAnalyses = 0;

    if (snapshot) {
      const generatedAt = toTimestamp(snapshot.generatedAt);
      if (generatedAt && this.shouldImport(generatedAt, this.syncState.snapshotGeneratedAt)) {
        await this.prisma.botSnapshot.create({
          data: {
            generatedAt: new Date(generatedAt),
            symbol: String(snapshot.symbol ?? workerConfig.symbol),
            mode: String(snapshot.mode ?? workerConfig.mode),
            payload: snapshot as Prisma.InputJsonValue,
          },
        });
        this.syncState.snapshotGeneratedAt = generatedAt;
        importedSnapshots += 1;
      }
    }

    if (metrics) {
      const generatedAt = toTimestamp(metrics.generatedAt);
      if (generatedAt && this.shouldImport(generatedAt, this.syncState.metricsGeneratedAt)) {
        await this.prisma.botMetric.create({
          data: {
            generatedAt: new Date(generatedAt),
            symbol: String(metrics.symbol ?? workerConfig.symbol),
            mode: String(metrics.mode ?? workerConfig.mode),
            payload: metrics as Prisma.InputJsonValue,
          },
        });
        this.syncState.metricsGeneratedAt = generatedAt;
        importedMetrics += 1;
      }
    }

    const newTrades = trades.filter((trade) =>
      trade.symbol === workerConfig.symbol &&
      trade.mode === workerConfig.mode &&
      trade.timestamp !== null &&
      this.shouldImport(trade.timestamp, this.syncState.latestTradeTimestamp)
    );

    for (const trade of newTrades) {
      await this.persistTrade(trade);
      this.syncState.latestTradeTimestamp = trade.timestamp;
      importedTrades += 1;
    }

    const newAnalyses = analyses.filter((analysis) =>
      analysis.symbol === workerConfig.symbol &&
      analysis.mode === workerConfig.mode &&
      analysis.timestamp !== null &&
      this.shouldImport(analysis.timestamp, this.syncState.latestAnalysisTimestamp)
    );

    for (const analysis of newAnalyses) {
      await this.persistAnalysis(analysis);
      this.syncState.latestAnalysisTimestamp = analysis.timestamp;
      importedAnalyses += 1;
    }

    await saveSyncState(this.syncState);

    if (importedSnapshots || importedMetrics || importedTrades || importedAnalyses) {
      logInfo("Sincronizacao oficial concluida", {
        snapshots: importedSnapshots,
        metricas: importedMetrics,
        trades: importedTrades,
        analises: importedAnalyses,
      });
    }
  }

  private shouldImport(nextValue: number, currentValue: number | null) {
    return currentValue === null || nextValue > currentValue;
  }

  private async mergeStateWithDatabase(localState: SyncState): Promise<SyncState> {
    const databaseState = await this.readDatabaseWatermarks();

    return {
      snapshotGeneratedAt: Math.max(localState.snapshotGeneratedAt ?? 0, databaseState.snapshotGeneratedAt ?? 0) || null,
      metricsGeneratedAt: Math.max(localState.metricsGeneratedAt ?? 0, databaseState.metricsGeneratedAt ?? 0) || null,
      latestTradeTimestamp: Math.max(localState.latestTradeTimestamp ?? 0, databaseState.latestTradeTimestamp ?? 0) || null,
      latestAnalysisTimestamp: Math.max(localState.latestAnalysisTimestamp ?? 0, databaseState.latestAnalysisTimestamp ?? 0) || null,
    };
  }

  private async readDatabaseWatermarks(): Promise<Watermarks> {
    const [snapshot, metrics, trade, analysis] = await Promise.all([
      this.prisma.botSnapshot.findFirst({
        where: { symbol: workerConfig.symbol, mode: workerConfig.mode },
        orderBy: { generatedAt: "desc" },
        select: { generatedAt: true },
      }),
      this.prisma.botMetric.findFirst({
        where: { symbol: workerConfig.symbol, mode: workerConfig.mode },
        orderBy: { generatedAt: "desc" },
        select: { generatedAt: true },
      }),
      this.prisma.trade.findFirst({
        where: { symbol: workerConfig.symbol, mode: workerConfig.mode },
        orderBy: [{ eventTimestamp: "desc" }, { id: "desc" }],
        select: { eventTimestamp: true },
      }),
      this.prisma.analysis.findFirst({
        where: { symbol: workerConfig.symbol, mode: workerConfig.mode },
        orderBy: [{ eventTimestamp: "desc" }, { id: "desc" }],
        select: { eventTimestamp: true },
      }),
    ]);

    return {
      snapshotGeneratedAt: snapshot?.generatedAt?.getTime() ?? null,
      metricsGeneratedAt: metrics?.generatedAt?.getTime() ?? null,
      latestTradeTimestamp: trade?.eventTimestamp?.getTime() ?? null,
      latestAnalysisTimestamp: analysis?.eventTimestamp?.getTime() ?? null,
    };
  }

  private async persistTrade(trade: LegacyTradeRecord) {
    if (trade.timestamp === null) {
      return;
    }

    await this.prisma.trade.create({
      data: {
        eventTimestamp: new Date(trade.timestamp),
        symbol: trade.symbol,
        mode: trade.mode,
        side: trade.side,
        action: trade.action,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        quantity: trade.quantity,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        pnlUsdt: trade.pnlUsdt,
        pnlBrl: trade.pnlBrl,
        fees: trade.fees,
        reason: trade.reason,
        openedAt: toDate(trade.openedAt),
        closedAt: toDate(trade.closedAt),
        signalCandleOpenTime: trade.signalCandleOpenTime,
        analysisDecision: trade.analysisDecision,
        payload: trade as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async persistAnalysis(analysis: LegacyAnalysisRecord) {
    if (analysis.timestamp === null) {
      return;
    }

    await this.prisma.analysis.create({
      data: {
        eventTimestamp: new Date(analysis.timestamp),
        symbol: analysis.symbol,
        mode: analysis.mode,
        decision: analysis.decision,
        longScore: analysis.longScore,
        shortScore: analysis.shortScore,
        closePrice: analysis.close,
        emaFast: analysis.emaFast,
        emaSlow: analysis.emaSlow,
        emaTrend: analysis.emaTrend,
        smaTrend: analysis.smaTrend,
        rsi: analysis.rsi,
        macd: analysis.macd,
        macdSignal: analysis.macdSignal,
        macdHistogram: analysis.macdHistogram,
        atr: analysis.atr,
        atrPercent: analysis.atrPercent,
        volumeRatio: analysis.volumeRatio,
        orderBookImbalance: analysis.orderBookImbalance,
        candleBodyRatio: analysis.candleBodyRatio,
        signalCandleOpenTime: analysis.signalCandleOpenTime,
        payload: analysis as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
