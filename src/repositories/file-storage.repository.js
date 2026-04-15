import { promises as fs } from "fs";
import path from "path";

const dataRoot = path.resolve(process.cwd(), "data");

function toCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

export function getDataPath(...segments) {
  return path.join(dataRoot, ...segments);
}

export async function ensureDirectoryForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function appendCsvRow(filePath, row) {
  await ensureDirectoryForFile(filePath);

  const headers = Object.keys(row);
  const fileExists = await fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);

  if (!fileExists) {
    const headerLine = `${headers.join(",")}\n`;
    await fs.writeFile(filePath, headerLine, "utf8");
  }

  const line = `${headers.map((header) => toCsvValue(row[header])).join(",")}\n`;
  await fs.appendFile(filePath, line, "utf8");
}

export async function writeJsonFile(filePath, data) {
  await ensureDirectoryForFile(filePath);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function readJsonFile(filePath, fallback = null) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}
