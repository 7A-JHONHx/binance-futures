function formatContext(context: Record<string, unknown>) {
  const entries = Object.entries(context).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    return "";
  }

  return ` ${JSON.stringify(Object.fromEntries(entries))}`;
}

export function logInfo(message: string, context: Record<string, unknown> = {}) {
  console.log(`[bot-worker] ${message}${formatContext(context)}`);
}

export function logWarn(message: string, context: Record<string, unknown> = {}) {
  console.warn(`[bot-worker] ${message}${formatContext(context)}`);
}

export function logError(message: string, context: Record<string, unknown> = {}) {
  console.error(`[bot-worker] ${message}${formatContext(context)}`);
}
