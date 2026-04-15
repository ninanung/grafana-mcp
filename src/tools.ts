import { ClientRegistry } from "@/client-registry.js";
import type { LogCache } from "@/log-cache.js";
import type { ToolDefinition, ToolResult } from "@/interfaces/tools.js";
import type {
  SearchDashboardsArgs,
  GetDashboardArgs,
  QueryLogsArgs,
  GetLogCacheArgs,
  RefreshLogCacheArgs,
  ExportLogCacheArgs,
  ImportLogCacheArgs,
} from "@/interfaces/tool-args.js";
import { handleSelfTest } from "@/tools/self-test.js";
import { handleListDataSources } from "@/tools/list-datasources.js";
import { handleSearchDashboards } from "@/tools/search-dashboards.js";
import { handleGetDashboard } from "@/tools/get-dashboard.js";
import { handleListLogDataSources } from "@/tools/list-log-datasources.js";
import { handleListServices } from "@/tools/list-services.js";
import type { ListServicesArgs } from "@/tools/list-services.js";
import { handleQueryLogs } from "@/tools/query-logs.js";
import {
  handleExtractDashboardQueries,
  type ExtractDashboardQueriesArgs,
} from "@/tools/extract-dashboard-queries.js";
import {
  handleGetLogCache,
  handleRefreshLogCache,
  handleExportLogCache,
  handleImportLogCache,
} from "@/tools/log-cache-tools.js";

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "self_test",
      description:
        "Check MCP server health: Grafana connectivity, version, and selected auth method.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_datasources",
      description: "List configured Grafana data sources.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "search_dashboards",
      description:
        "Search Grafana dashboards by query, tags, or type. Returns uid/title/folder — use get_dashboard with uid for details.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Title search keyword" },
          tag: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags",
          },
          type: {
            type: "string",
            enum: ["dash-db", "dash-folder"],
            description: "Result type (default dash-db)",
          },
          limit: { type: "number", description: "Max results (default 50)" },
        },
      },
    },
    {
      name: "get_dashboard",
      description:
        "Fetch a dashboard's full JSON (panels, queries, variables) by uid.",
      inputSchema: {
        type: "object",
        properties: {
          uid: { type: "string", description: "Dashboard uid" },
        },
        required: ["uid"],
      },
    },
    {
      name: "extract_dashboard_queries",
      description:
        "Extract all panel queries from a dashboard. Each entry has panel_id, panel_title, datasource_uid, datasource_type, expr, and is_log_query. Use this to discover the LogQL/datasource_uid behind a Grafana dashboard URL, then feed expr into query_logs.raw_logql.",
      inputSchema: {
        type: "object",
        properties: {
          uid: { type: "string", description: "Dashboard uid (the path segment after /d/ in the URL)." },
          log_only: { type: "boolean", description: "If true, return only queries against log datasources." },
        },
        required: ["uid"],
      },
    },
    {
      name: "list_log_datasources",
      description:
        "List Grafana datasources that store logs (Loki, Elasticsearch, CloudWatch, OpenSearch, Splunk). Cached.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_services",
      description:
        "List service names discoverable from Loki labels. Useful when the exact service name is unknown before calling query_logs.",
      inputSchema: {
        type: "object",
        properties: {
          datasource_uid: {
            type: "string",
            description: "Optional. Limit to a single Loki datasource uid.",
          },
          time_from: {
            type: "string",
            description: "Start time (default 'now-1h').",
          },
          time_to: { type: "string", description: "End time (default 'now')." },
        },
      },
    },
    {
      name: "query_logs",
      description:
        "Query logs for a service within a time range. Auto-detects the log datasource and service label by scanning Loki labels — previously resolved services are cached so repeat calls skip detection. Output mode is user-selectable: 'raw' (default), 'summarize' (groups similar lines by pattern with counts), 'json'.",
      inputSchema: {
        type: "object",
        properties: {
          service: {
            type: "string",
            description: "Service name to search (label value, e.g. 'api', 'checkout')",
          },
          datasource_uid: {
            type: "string",
            description:
              "Optional. Log datasource uid. Omit to auto-detect the datasource whose labels contain the service value.",
          },
          service_label: {
            type: "string",
            description:
              "Optional. Override the label key for service (e.g. 'app', 'container'). Omit to auto-detect.",
          },
          level: {
            type: "string",
            description: "Optional log level filter (e.g. 'error', 'warn'). Case-insensitive word match.",
          },
          keyword: {
            type: "string",
            description: "Optional substring/regex filter applied to log lines (case-insensitive).",
          },
          time_from: {
            type: "string",
            description: "Start time. 'now-30m', 'now-1h', 'now-2d', or ISO 8601. Default 'now-1h'.",
          },
          time_to: {
            type: "string",
            description: "End time. Same format as time_from. Default 'now'.",
          },
          limit: { type: "number", description: "Max lines to return (default 100)." },
          output: {
            type: "string",
            enum: ["raw", "summarize", "json"],
            description: "Output mode. raw (default): timestamp + line. summarize: pattern-grouped. json: structured.",
          },
          refresh: {
            type: "boolean",
            description: "If true, bypass cached service resolution and re-detect.",
          },
          raw_logql: {
            type: "string",
            description:
              "Escape hatch: pass a full LogQL expression (e.g. '{namespace=\"x\", container=\"y\"} |= \"err\"'). When set, service/service_label detection is skipped and `datasource_uid` is required. Use this for multi-label selectors or advanced queries.",
          },
        },
      },
    },
    {
      name: "get_log_cache",
      description:
        "Inspect the local log cache (log datasources, detected labels, resolved services). Use to confirm what is cached and whether a service has been resolved before.",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Filter summary lines by keyword." },
        },
      },
    },
    {
      name: "refresh_log_cache",
      description:
        "Invalidate cached entries. Pass service to clear one service's resolution; pass all=true to clear everything for this Grafana instance.",
      inputSchema: {
        type: "object",
        properties: {
          service: { type: "string", description: "Service name to invalidate." },
          all: { type: "boolean", description: "Clear all cache entries for this Grafana URL." },
        },
      },
    },
    {
      name: "export_log_cache",
      description: "Export the log cache to a JSON file (to share with teammates or back up).",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Output file path." },
        },
        required: ["path"],
      },
    },
    {
      name: "import_log_cache",
      description: "Import a log cache JSON file. mode=merge (default) merges; mode=replace replaces everything.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Input JSON path." },
          mode: {
            type: "string",
            enum: ["merge", "replace"],
            description: "merge (default) or replace.",
          },
        },
        required: ["path"],
      },
    },
  ];
}

export async function handleToolCall(
  name: string,
  rawArgs: Record<string, unknown>,
  registry: ClientRegistry,
  cache: LogCache
): Promise<ToolResult> {
  const { instance, ...args } = rawArgs as Record<string, unknown> & {
    instance?: string;
  };
  const ctx = registry.resolve(
    typeof instance === "string" ? instance : undefined
  );
  const client = ctx.client;

  switch (name) {
    case "self_test":
      return handleSelfTest(client, ctx.name);
    case "list_datasources":
      return handleListDataSources(client);
    case "search_dashboards":
      return handleSearchDashboards(args as unknown as SearchDashboardsArgs, client);
    case "get_dashboard":
      return handleGetDashboard(args as unknown as GetDashboardArgs, client);
    case "extract_dashboard_queries":
      return handleExtractDashboardQueries(args as unknown as ExtractDashboardQueriesArgs, client);
    case "list_log_datasources":
      return handleListLogDataSources(client, cache);
    case "list_services":
      return handleListServices(args as unknown as ListServicesArgs, client, cache);
    case "query_logs":
      return handleQueryLogs(args as unknown as QueryLogsArgs, client, cache);
    case "get_log_cache":
      return handleGetLogCache(args as unknown as GetLogCacheArgs, cache);
    case "refresh_log_cache":
      return handleRefreshLogCache(args as unknown as RefreshLogCacheArgs, client, cache);
    case "export_log_cache":
      return handleExportLogCache(args as unknown as ExportLogCacheArgs, cache);
    case "import_log_cache":
      return handleImportLogCache(args as unknown as ImportLogCacheArgs, cache);
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}
