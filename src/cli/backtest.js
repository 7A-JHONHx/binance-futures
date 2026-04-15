import "dotenv/config";
import { runBacktest } from "../services/backtest.service.js";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const result = await runBacktest(args);

console.log(
  JSON.stringify(
    {
      summary: result.summary,
      artifacts: result.artifacts,
    },
    null,
    2
  )
);
