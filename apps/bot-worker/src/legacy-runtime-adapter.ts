import { LegacyStrategyBridge } from "./bridges/legacy-strategy.bridge.js";
import { workerConfig } from "./config.js";
import { logInfo, logWarn } from "./logger.js";
import { getRepoRoot } from "./repo-paths.js";

let runtimePromise: Promise<void> | null = null;

export async function startOperationalRuntime() {
  if (!workerConfig.operationalRuntimeEnabled) {
    logWarn("runtime operacional legado desativado por configuracao");
    return;
  }

  if (runtimePromise) {
    return runtimePromise;
  }

  runtimePromise = (async () => {
    const repoRoot = getRepoRoot();
    const strategyBridge = new LegacyStrategyBridge();

    process.env.BINANCE_FUTURES_ROOT ||= repoRoot;
    process.chdir(repoRoot);

    logInfo("Hospedando runtime operacional legado", {
      entry: "src/index.js",
      ativo: workerConfig.symbol,
      modo: workerConfig.mode,
    });

    await strategyBridge.startRuntime();
  })();

  return runtimePromise;
}
