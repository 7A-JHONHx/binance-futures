function write(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  const payload = JSON.stringify(entry);

  if (level === "error") {
    console.error(payload);
    return;
  }

  console.log(payload);
}

export function logInfo(message, context = {}) {
  write("info", message, context);
}

export function logWarn(message, context = {}) {
  write("warn", message, context);
}

export function logError(message, error, context = {}) {
  write("error", message, {
    ...context,
    error: error?.message || "Unknown error",
    details: error?.response?.data || null,
  });
}
