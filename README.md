# grafana-mcp

[![npm version](https://img.shields.io/npm/v/@seungje.jun/grafana-mcp.svg)](https://www.npmjs.com/package/@seungje.jun/grafana-mcp)
[![license](https://img.shields.io/npm/l/@seungje.jun/grafana-mcp.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/@seungje.jun/grafana-mcp.svg)](https://nodejs.org)

Expose a slice of the Grafana API as an MCP (Model Context Protocol) server, focused on natural-language log querying. The main goal: say "show me error logs from the api service in the last 30 minutes" and get the actual log lines back — without juggling LogQL, labels, or datasource UIDs by hand.

Log datasources, Loki labels, and the mapping from a service name to its hosting datasource/label are cached on disk, so repeat calls skip redundant label scans.

[한국어 문서 / Korean README](./README_kr.md)

## Installation & Setup

### npx (no installation required)

Add the following to `~/.mcp.json`.

```json
{
  "mcpServers": {
    "grafana": {
      "command": "npx",
      "args": ["@seungje.jun/grafana-mcp"],
      "env": {
        "GRAFANA_URL": "https://grafana.example.com",
        "GRAFANA_SERVICE_ACCOUNT_TOKEN": "glsa_xxx"
      }
    }
  }
}
```

### Build from source

```bash
git clone https://github.com/ninanung/grafana-mcp.git
cd grafana-mcp
npm install
npm run build
```

```json
{
  "mcpServers": {
    "grafana": {
      "command": "node",
      "args": ["/path/to/grafana-mcp/dist/cli.js"],
      "env": {
        "GRAFANA_URL": "https://grafana.example.com",
        "GRAFANA_SERVICE_ACCOUNT_TOKEN": "glsa_xxx"
      }
    }
  }
}
```

Restart Claude Code to activate the MCP tools.

### Authentication

One of the following is required. They are checked in the order below — the first one present wins.

| Variable | When to use |
|----------|-------------|
| `GRAFANA_SERVICE_ACCOUNT_TOKEN` | Grafana 9.1+ (recommended) |
| `GRAFANA_CLOUD_ACCESS_POLICY_TOKEN` | Grafana Cloud |
| `GRAFANA_API_KEY` | Legacy API Keys (deprecated in 10.x) |
| `GRAFANA_USERNAME` + `GRAFANA_PASSWORD` | Basic Auth fallback |

All bearer-style tokens are sent as `Authorization: Bearer <token>`. The server does not care which kind of token it is — it only picks the one that is set.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GRAFANA_URL` | Grafana server URL (single-instance mode, required when `GRAFANA_INSTANCES` is unset) |
| `GRAFANA_INSTANCES` | (optional) JSON array for multi-instance mode. Example: `[{"name":"prod","url":"...","service_account_token":"..."},{"name":"dev","url":"...","api_key":"..."}]`. When set, pass `instance: "prod"` on any tool call to pick the target. Falls back to the first entry if omitted. |
| `GRAFANA_ORG_ID` | (optional) Sent as `X-Grafana-Org-Id` header. For multi-org setups. |
| `GRAFANA_TLS_SKIP_VERIFY` | (optional) `true` / `1` to skip TLS verification (self-signed Grafana). |
| `GRAFANA_MCP_LOG` | (optional) Log level: `debug`, `info` (default), `warn`, `error`, `silent`. Logs go to stderr to avoid corrupting the MCP stdio channel. |
| `GRAFANA_MCP_AUDIT_LOG` | (optional) Audit log file path. Defaults to `~/.grafana-mcp/audit.log`. Set to `off` to disable. Each line is a JSON record with tool name, args, duration, status. |
| `GRAFANA_MCP_CACHE` | (optional) Set to `off` to disable the on-disk log cache. |
| `GRAFANA_MCP_CACHE_PATH` | (optional) Log cache file path. Defaults to `~/.grafana-mcp/log-cache.json`. |
| `GRAFANA_MCP_CACHE_TTL_DATASOURCES_MS` | (optional) TTL for the log-datasource list cache. Default `86400000` (24h). |
| `GRAFANA_MCP_CACHE_TTL_LABELS_MS` | (optional) TTL for the Loki label-key cache. Default `86400000` (24h). |
| `GRAFANA_MCP_CACHE_TTL_LABEL_VALUES_MS` | (optional) TTL for the Loki label-value cache. Default `3600000` (1h). |
| `GRAFANA_MCP_CACHE_TTL_SERVICE_MS` | (optional) TTL for the `{service → (ds_uid, label)}` resolution cache. Default `3600000` (1h). |

## Tools

| Tool | Description |
|------|-------------|
| `self_test` | Diagnostic check — connectivity, version, auth, and capability probes (`list_datasources`, `proxy_uid`, `ds_query`) with guidance on which arguments are required |
| `list_datasources` | List all configured datasources |
| `search_dashboards` | Search dashboards by query/tag/type |
| `get_dashboard` | Fetch a dashboard's full JSON by uid |
| `extract_dashboard_queries` | Extract panel queries (LogQL/PromQL) from a dashboard, with `datasource_uid`. Use to discover args for `query_logs.raw_logql` from a dashboard URL |
| `list_log_datasources` | List only log-type datasources (Loki, Elasticsearch, CloudWatch, OpenSearch, Splunk). Cached |
| `list_services` | List service names discoverable from Loki labels — useful before calling `query_logs` |
| `query_logs` | Query logs for a service/time-range/level. Auto-detects the log datasource and service label. Supports `raw_logql` for multi-label/advanced selectors. Falls back to `/api/ds/query` when uid-proxy is unavailable (Grafana <9.0). Output mode: `raw` / `summarize` / `json` |
| `get_log_cache` | Inspect what is currently cached (log datasources, labels, resolved services) |
| `refresh_log_cache` | Invalidate one service's resolution or clear all entries for the Grafana instance |
| `export_log_cache` | Export the log cache to a JSON file |
| `import_log_cache` | Import a log cache from a JSON file (merge/replace) |

## Usage Example

A typical natural-language flow, as orchestrated by the MCP client:

1. User: "Show me error logs from the api service in the last 30 minutes."
2. `query_logs` with `service: "api"`, `level: "error"`, `time_from: "now-30m"` → the server auto-detects which Loki datasource owns the `service="api"` label and runs LogQL.
3. (First call) the service → datasource/label mapping is saved to the cache; subsequent calls skip the detection step.
4. User: "Summarize those errors by pattern." → same call with `output: "summarize"` returns pattern-grouped counts.
5. User: "What other services do we have?" → `list_services` returns the full service list.

If the service name has a typo, `query_logs` surfaces close matches (e.g. `Did you mean: checkout, checkout-api?`).

## How the Auto-Detection Works

`query_logs` picks the target datasource and label on its own:

1. Filter all datasources down to log types (Loki/ES/CloudWatch/OpenSearch/Splunk).
2. For each Loki datasource, fetch `/loki/api/v1/labels` and walk common service-label candidates (`service`, `service_name`, `app`, `app_name`, `application`, `container`, `job`) first, then any remaining labels.
3. For each candidate label, fetch its values and check whether the requested `service` name is in that list.
4. If exactly one `(datasource, label)` pair matches, use it. If multiple match, require `datasource_uid` to disambiguate. If none match, return close-name suggestions.
5. The resolved `(service → ds_uid, label)` is cached; `refresh: true` or `refresh_log_cache` forces re-detection.

Auto-detection currently supports Loki only. For Elasticsearch / CloudWatch / Splunk datasources, pass `datasource_uid` and `service_label` explicitly (and expect LogQL-specific filters not to apply).

## Output Modes

`query_logs` accepts `output`:

- `raw` (default): `<ISO timestamp>  <log line>` — good for direct reading in a terminal.
- `summarize`: groups lines by normalized pattern (numbers → `N`, UUIDs → `UUID`) with counts and a sample per pattern. Use when lines are noisy or too many.
- `json`: structured objects `{ ts, line, labels }` — for downstream tooling.

## Cache

- **Log cache**: persisted to `~/.grafana-mcp/log-cache.json`. Keyed by Grafana base URL so multiple instances don't collide.
- Each category has its own TTL (datasources / labels / label values / service resolution) — see the env-var table above.
- A cached service resolution that later fails (e.g. label got renamed) is invalidated automatically so the next call re-detects.
- Use `get_log_cache` to inspect, `refresh_log_cache` to clear, and `export_log_cache` / `import_log_cache` to share with teammates.

### Cache Location & Reset

| Cache | Location | Reset |
|-------|----------|-------|
| Log cache | `~/.grafana-mcp/log-cache.json` | call `refresh_log_cache all=true`, or delete the file |

The cache file is a plain JSON document — safe to inspect, edit, or back up manually.

## Safety & Constraints

- **Read-only**: the server does not expose any endpoint that mutates Grafana state. No dashboard/datasource CRUD, no alerting changes.
- **Stdio logs**: all logs go to stderr, keeping the MCP stdio channel clean.
- **TLS skip**: `GRAFANA_TLS_SKIP_VERIFY=true` sets `NODE_TLS_REJECT_UNAUTHORIZED=0` process-wide. Use only for self-signed Grafana in trusted networks.
- **No secret logging**: auth tokens are never written to audit logs.

## License

[MIT](./LICENSE)
