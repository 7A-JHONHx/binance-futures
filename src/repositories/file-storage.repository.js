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

  const fileExists = await fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
  let headers = Object.keys(row);

  if (!fileExists) {
    const headerLine = `${headers.join(",")}\n`;
    await fs.writeFile(filePath, headerLine, "utf8");
  } else {
    const currentContent = await fs.readFile(filePath, "utf8");
    const currentHeaderLine = currentContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    if (currentHeaderLine) {
      headers = parseCsvLine(currentHeaderLine);
    }
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

function parseCsvLine(line) {
  const values = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        currentValue += '"';
        index += 1;
        continue;
      }

      insideQuotes = !insideQuotes;
      continue;
    }

    if (character === "," && !insideQuotes) {
      values.push(currentValue);
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue);
  return values;
}

export async function readCsvRows(filePath, fallback = []) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    if (lines.length === 0) {
      return fallback;
    }

    const headers = parseCsvLine(lines[0]);

    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line);

      return Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""])
      );
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}
