type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, msg: string, fields: Fields = {}) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    msg,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// Workers Logs で検索しやすい構造化 JSON ロガー
export function createLogger(baseFields: Fields = {}) {
  const log = (level: Level, msg: string, extra?: Fields) =>
    emit(level, msg, { ...baseFields, ...extra });
  return {
    debug: (msg: string, extra?: Fields) => log("debug", msg, extra),
    info: (msg: string, extra?: Fields) => log("info", msg, extra),
    warn: (msg: string, extra?: Fields) => log("warn", msg, extra),
    error: (msg: string, extra?: Fields) => log("error", msg, extra),
    child: (fields: Fields) => createLogger({ ...baseFields, ...fields }),
  };
}

export const logger = createLogger();
