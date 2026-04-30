import { promises as fs } from "node:fs";
import path from "node:path";
import { workerConfig } from "./config.js";
import { resolveRepoPath } from "./repo-paths.js";
import type { SyncState } from "./types.js";

const runtimeRoot = resolveRepoPath(".runtime");
const stateFilePath = path.join(runtimeRoot, workerConfig.runtimeStateFileName);

const defaultState: SyncState = {
  snapshotGeneratedAt: null,
  metricsGeneratedAt: null,
  latestTradeTimestamp: null,
  latestAnalysisTimestamp: null,
};

export async function loadSyncState(): Promise<SyncState> {
  try {
    const content = await fs.readFile(stateFilePath, "utf8");
    return {
      ...defaultState,
      ...(JSON.parse(content) as Partial<SyncState>),
    };
  } catch {
    return { ...defaultState };
  }
}

export async function saveSyncState(state: SyncState) {
  await fs.mkdir(runtimeRoot, { recursive: true });
  await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2), "utf8");
}
