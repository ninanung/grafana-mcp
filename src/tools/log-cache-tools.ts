import type { GrafanaClient } from "@/grafana-client.js";
import type { ToolResult } from "@/interfaces/tools.js";
import type {
  GetLogCacheArgs,
  RefreshLogCacheArgs,
  ExportLogCacheArgs,
  ImportLogCacheArgs,
} from "@/interfaces/tool-args.js";
import type { LogCache } from "@/log-cache.js";

function ensureCache(cache?: LogCache): LogCache {
  if (!cache || !cache.isEnabled()) {
    throw new Error("Log cache is disabled. Unset GRAFANA_MCP_CACHE=off to enable.");
  }
  return cache;
}

export async function handleGetLogCache(
  args: GetLogCacheArgs,
  cache?: LogCache
): Promise<ToolResult> {
  const c = ensureCache(cache);
  let text = c.getSummary();
  if (args.keyword) {
    const lower = args.keyword.toLowerCase();
    text = text
      .split("\n")
      .filter((line) => line.toLowerCase().includes(lower) || line.startsWith("Log cache"))
      .join("\n");
  }
  return { content: [{ type: "text", text }] };
}

export async function handleRefreshLogCache(
  args: RefreshLogCacheArgs,
  client: GrafanaClient,
  cache?: LogCache
): Promise<ToolResult> {
  const c = ensureCache(cache);
  const url = client.getBaseUrl();
  if (args.all) {
    c.clear(url);
    return {
      content: [{ type: "text", text: `Cleared cache for ${url}.` }],
    };
  }
  if (args.service) {
    c.invalidateService(url, args.service);
    return {
      content: [{ type: "text", text: `Invalidated service resolution: ${args.service}` }],
    };
  }
  return {
    content: [{ type: "text", text: "Specify service or all=true." }],
    isError: true,
  };
}

export async function handleExportLogCache(
  args: ExportLogCacheArgs,
  cache?: LogCache
): Promise<ToolResult> {
  const c = ensureCache(cache);
  if (!args.path) {
    return { content: [{ type: "text", text: "path is required." }], isError: true };
  }
  c.exportTo(args.path);
  return { content: [{ type: "text", text: `Exported log cache to ${args.path}` }] };
}

export async function handleImportLogCache(
  args: ImportLogCacheArgs,
  cache?: LogCache
): Promise<ToolResult> {
  const c = ensureCache(cache);
  if (!args.path) {
    return { content: [{ type: "text", text: "path is required." }], isError: true };
  }
  const mode = args.mode ?? "merge";
  c.importFrom(args.path, mode);
  return { content: [{ type: "text", text: `Imported log cache from ${args.path} (mode=${mode})` }] };
}
