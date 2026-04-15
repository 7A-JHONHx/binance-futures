import { readJsonFile, getDataPath } from "../repositories/file-storage.repository.js";

const snapshot = await readJsonFile(getDataPath("monitoring", "bot-status.json"), null);
const metrics = await readJsonFile(getDataPath("monitoring", "metrics.json"), null);

console.log(
  JSON.stringify(
    {
      snapshot,
      metrics,
    },
    null,
    2
  )
);
