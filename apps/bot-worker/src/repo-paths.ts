import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);

function resolveFromCurrentFile() {
  const distRootCandidate = path.resolve(currentDir, "../../../../");
  const srcRootCandidate = path.resolve(currentDir, "../../../");

  if (path.basename(distRootCandidate) === "binance-futures") {
    return distRootCandidate;
  }

  return srcRootCandidate;
}

function resolveRepoRoot() {
  return (
    process.env.BINANCE_FUTURES_ROOT ||
    process.env.INIT_CWD ||
    resolveFromCurrentFile()
  );
}

export function resolveRepoPath(...segments: string[]) {
  return path.resolve(resolveRepoRoot(), ...segments);
}

export function getRepoRoot() {
  return resolveRepoRoot();
}
