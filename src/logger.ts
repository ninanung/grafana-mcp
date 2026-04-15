type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.GRAFANA_MCP_LOG ?? "info").toLowerCase();
  if (raw in LEVELS) return raw as LogLevel;
  return "info";
}

const currentLevel = LEVELS[resolveLevel()];

function emit(level: LogLevel, ...args: unknown[]): void {
  if (LEVELS[level] < currentLevel) return;
  const ts = new Date().toISOString();
  // stdout is used by MCP stdio transport; logs must go to stderr only.
  console.error(`[${ts}] [${level}]`, ...args);
}

export const logger = {
  debug: (...args: unknown[]) => emit("debug", ...args),
  info: (...args: unknown[]) => emit("info", ...args),
  warn: (...args: unknown[]) => emit("warn", ...args),
  error: (...args: unknown[]) => emit("error", ...args),
  level: resolveLevel(),
};
