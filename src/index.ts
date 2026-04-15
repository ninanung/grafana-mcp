import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AuditLog } from "@/audit-log.js";
import { buildRegistryFromEnv, ClientRegistry } from "@/client-registry.js";
import { LogCache } from "@/log-cache.js";
import { getToolDefinitions, handleToolCall } from "@/tools.js";
import { logger } from "@/logger.js";

let registry: ClientRegistry;
try {
  registry = buildRegistryFromEnv();
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

  try {
    const result = await handleToolCall(name, args ?? {}, registry, logCache);
    const durationMs = Date.now() - started;
    logger.info(`tool ${name} done in ${durationMs}ms`);
    auditLog.record({
      tool: name,
      args,
      durationMs,
      status: result.isError ? "error" : "ok",
    });
    return result;
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
    return {
      content: [
        { type: "text" as const, text: `Error: ${message}` },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(
    `grafana-mcp started (log level: ${logger.level}, instances: ${registry.names().join(",")}, audit: ${auditLog.getPath() ?? "off"}, cache: ${logCache.getPath() ?? "off"})`
  );
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
