import { createBootstrapSnapshot } from "@binance-futures/shared";
import { workerConfig } from "./config.js";
import { DatabaseSyncService } from "./database-sync.service.js";
import { LegacyStateBridge } from "./bridges/legacy-state.bridge.js";
import { startOperationalRuntime } from "./legacy-runtime-adapter.js";
import { logError, logInfo, logWarn } from "./logger.js";
import type { TradingEngineBootstrapResult } from "./trading-engine.types.js";

export class TradingEngineService {
  private readonly syncService = new DatabaseSyncService();
  private readonly stateBridge = new LegacyStateBridge();
  private syncTimer: NodeJS.Timeout | null = null;
  private syncReady = false;

  async bootstrap(): Promise<TradingEngineBootstrapResult> {
    const snapshot = createBootstrapSnapshot({
      service: workerConfig.serviceName,
      mode: workerConfig.mode,
      symbol: workerConfig.symbol,
    });

    logInfo("nova base iniciada");
    console.log(snapshot);

    this.syncReady = await this.syncService.start();

    if (!this.syncReady) {
      logWarn("worker iniciado sem sincronizacao oficial");
    } else {
      await this.syncService.syncOnce();
    }

    const stateSnapshot = await this.stateBridge.load();

    logInfo("engine de trading legado conectado", {
      ativo: workerConfig.symbol,
      modo: workerConfig.mode,
      posicaoAberta: stateSnapshot.position.isOpen,
      lado: stateSnapshot.position.side,
      entradasNoDia: stateSnapshot.daily.entriesOpened,
      tradesFechadosNoDia: stateSnapshot.daily.tradesClosed,
    });

    return {
      syncReady: this.syncReady,
      runtimeEnabled: workerConfig.operationalRuntimeEnabled,
      symbol: workerConfig.symbol,
      mode: workerConfig.mode,
      stateSnapshot,
    };
  }

  async start() {
    await startOperationalRuntime();

    if (this.syncReady) {
      this.syncTimer = setInterval(() => {
        this.syncService.syncOnce().catch((error) => {
          logError("falha durante sincronizacao agendada", {
            error: error instanceof Error ? error.message : "erro desconhecido",
          });
        });
      }, workerConfig.syncIntervalMs);
    }
  }

  async shutdown() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.syncReady) {
      await this.syncService.stop();
    }
  }
}
