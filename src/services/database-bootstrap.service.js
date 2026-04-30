import { getDataPath, readJsonFile } from "../repositories/file-storage.repository.js";
import {
  getDatabaseHealth,
  getDatabaseTableCounts,
  saveAnalysisToDatabase,
  saveMetricsToDatabase,
  saveSnapshotToDatabase,
  saveTradeToDatabase,
} from "../repositories/postgres/index.js";
import { loadAnalysisHistory, loadTradeHistory } from "./journal.service.js";
import { logInfo } from "../utils/logger.js";

const statusSnapshotPath = getDataPath("monitoring", "bot-status.json");
const metricsPath = getDataPath("monitoring", "metrics.json");

export async function hydrateDatabaseFromLocalFiles() {
  const database = getDatabaseHealth();

  if (!database.enabled) {
    return false;
  }

  const counts = await getDatabaseTableCounts();

  if (!counts) {
    return false;
  }

  const [snapshot, metrics, trades, analyses] = await Promise.all([
    readJsonFile(statusSnapshotPath, null),
    readJsonFile(metricsPath, null),
    loadTradeHistory(),
    loadAnalysisHistory(),
  ]);

  let importedSnapshots = 0;
  let importedMetrics = 0;
  let importedTrades = 0;
  let importedAnalyses = 0;

  if (counts.snapshots === 0 && snapshot) {
    await saveSnapshotToDatabase(snapshot);
    importedSnapshots += 1;
  }

  if (counts.metrics === 0 && metrics) {
    await saveMetricsToDatabase(metrics);
    importedMetrics += 1;
  }

  if (counts.trades === 0 && trades.length > 0) {
    for (const trade of trades) {
      await saveTradeToDatabase({
        ...trade,
        timestamp: trade.timestamp ? new Date(trade.timestamp).toISOString() : new Date().toISOString(),
      });
      importedTrades += 1;
    }
  }

  if (counts.analyses === 0 && analyses.length > 0) {
    for (const analysis of analyses) {
      await saveAnalysisToDatabase({
        ...analysis,
        timestamp: analysis.timestamp
          ? new Date(analysis.timestamp).toISOString()
          : new Date().toISOString(),
        symbol: analysis.symbol || snapshot?.symbol || metrics?.symbol || "BTCUSDT",
        mode: analysis.mode || snapshot?.mode || metrics?.mode || "live",
      });
      importedAnalyses += 1;
    }
  }

  const importedAnything =
    importedSnapshots + importedMetrics + importedTrades + importedAnalyses > 0;

  if (importedAnything) {
    logInfo("Historico local importado para o Postgres", {
      snapshotsImportados: importedSnapshots,
      metricasImportadas: importedMetrics,
      tradesImportados: importedTrades,
      analisesImportadas: importedAnalyses,
    });
  }

  return importedAnything;
}
