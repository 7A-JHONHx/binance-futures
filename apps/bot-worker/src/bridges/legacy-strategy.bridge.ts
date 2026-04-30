import { pathToFileURL } from "node:url";
import { resolveRepoPath } from "../repo-paths.js";

type LegacyRuntimeModule = {
  bootstrapLegacyStrategy: () => Promise<void>;
  startLegacyMarketStream: () => void;
  startLegacyBotRuntime: () => Promise<void>;
};

type LegacyStrategyModule = {
  initializeStrategy: () => Promise<void>;
  handlePrice: (price: number) => Promise<void>;
};

let runtimeModulePromise: Promise<LegacyRuntimeModule> | null = null;
let strategyModulePromise: Promise<LegacyStrategyModule> | null = null;

async function loadRuntimeModule() {
  if (!runtimeModulePromise) {
    runtimeModulePromise = import(
      pathToFileURL(resolveRepoPath("src", "index.js")).href
    ) as Promise<LegacyRuntimeModule>;
  }

  return runtimeModulePromise;
}

async function loadStrategyModule() {
  if (!strategyModulePromise) {
    strategyModulePromise = import(
      pathToFileURL(resolveRepoPath("src", "services", "strategy.service.js")).href
    ) as Promise<LegacyStrategyModule>;
  }

  return strategyModulePromise;
}

export class LegacyStrategyBridge {
  async bootstrap() {
    const runtimeModule = await loadRuntimeModule();
    await runtimeModule.bootstrapLegacyStrategy();
  }

  async startRuntime() {
    const runtimeModule = await loadRuntimeModule();
    await runtimeModule.startLegacyBotRuntime();
  }

  async startMarketStream() {
    const runtimeModule = await loadRuntimeModule();
    runtimeModule.startLegacyMarketStream();
  }

  async initializeStrategy() {
    const strategyModule = await loadStrategyModule();
    await strategyModule.initializeStrategy();
  }

  async handlePrice(price: number) {
    const strategyModule = await loadStrategyModule();
    await strategyModule.handlePrice(price);
  }
}
