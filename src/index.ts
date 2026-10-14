import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AuditLog } from "@/audit-log.js";
import { ClientRegistry } from "@/client-registry.js";
import { loadInstances } from "@/instance-config.js";
import { LogCache } from "@/log-cache.js";
import { getToolDefinitions, handleToolCall, prependText } from "@/tools.js";
import type { ToolResult } from "@/interfaces/tools.js";
import { logger } from "@/logger.js";

let registry: ClientRegistry;
try {
  registry = new ClientRegistry(loadInstances());
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
const auditLog = new AuditLog();
const logCache = new LogCache();

const server = new Server(
  { name: "grafana-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: getToolDefinitions() };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const started = Date.now();
  logger.debug(`tool call: ${name}`, args);
  const notices = registry.reloadIfChanged();
  const withNotices = (result: ToolResult): ToolResult =>
    notices.length > 0 ? prependText(result, notices.join("\n")) : result;

  try {
    const { result, instance, error } = await handleToolCall(name, args ?? {}, registry, logCache);
    const durationMs = Date.now() - started;
    if (error) logger.error(`tool ${name} failed on ${instance}:`, error);
    else logger.info(`tool ${name} done in ${durationMs}ms`);
    auditLog.record({
      tool: name,
      instance,
      args,
      durationMs,
      status: result.isError ? "error" : "ok",
      error,
    });
    return withNotices(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`tool ${name} failed:`, message);
    auditLog.record({
      tool: name,
      args,
      durationMs: Date.now() - started,
      status: "error",
      error: message,
    });
    return withNotices({
      content: [
        { type: "text" as const, text: `Error: ${message}` },
      ],
      isError: true,
    });
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(
    `grafana-mcp started (log level: ${logger.level}, instances: ${registry.names().join(",")}, default: ${registry.getDefault().name}, instances file: ${registry.getFilePath()}, audit: ${auditLog.getPath() ?? "off"}, cache: ${logCache.getPath() ?? "off"})`
  );
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
