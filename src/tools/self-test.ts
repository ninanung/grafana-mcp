import type { GrafanaClient } from "@/grafana-client.js";
import type { ToolResult } from "@/interfaces/tools.js";
import { isPermissionError, isProxyUidUnsupported } from "@/permission-error.js";

interface CapabilityResult {
  name: string;
  ok: boolean;
  detail: string;
}

export async function handleSelfTest(
  client: GrafanaClient,
  instanceName: string
): Promise<ToolResult> {
  const lines: string[] = [];
  lines.push(`instance: ${instanceName}`);
  lines.push(`auth: ${client.getAuthDescription()}`);

  let version = "unknown";
  try {
    const health = await client.health();
    version = health.version ?? "unknown";
    lines.push(`health: OK (version=${version}, database=${health.database ?? "unknown"})`);
  } catch (err) {
    lines.push(`health: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
  }

  const caps = await probeCapabilities(client);
  lines.push("");
  lines.push("capabilities:");
  for (const c of caps) {
    lines.push(`  ${c.ok ? "✓" : "✗"} ${c.name} — ${c.detail}`);
  }

  lines.push("");
  lines.push(buildGuidance(caps));

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

async function probeCapabilities(client: GrafanaClient): Promise<CapabilityResult[]> {
  const out: CapabilityResult[] = [];

  // 1) listDataSources — admin/editor required on most versions
  try {
    const ds = await client.listDataSources();
    out.push({
      name: "list_datasources",
      ok: true,
      detail: `${ds.length} datasource(s) visible — auto-detection paths available`,
    });
  } catch (err) {
    const reason = isPermissionError(err) ? "permission denied (Editor+ key required)" : truncate(err);
    out.push({
      name: "list_datasources",
      ok: false,
      detail: `${reason} — supply datasource_uid explicitly for log queries`,
    });
  }

  // 2) proxy uid path (Grafana 9.0+)
  let proxyOk = false;
  try {
    await client.proxyGet("__probe__", "/api/v1/labels", { start: 0, end: 1 });
    proxyOk = true;
  } catch (err) {
    proxyOk = !isProxyUidUnsupported(err) && !isPermissionError(err);
  }
  out.push({
    name: "proxy_uid (labels/values)",
    ok: proxyOk,
    detail: proxyOk
      ? "uid-based proxy works — service_label auto-detect available"
      : "uid-based proxy unavailable (likely Grafana <9.0) — supply service_label explicitly or use raw_logql",
  });

  // 3) /api/ds/query — universal viewer-friendly query path
  try {
    await client.queryDatasource({ queries: [], from: "0", to: "0" });
    out.push({
      name: "ds_query (POST /api/ds/query)",
      ok: true,
      detail: "available — used as fallback when proxy_uid is unsupported",
    });
  } catch (err) {
    if (isPermissionError(err)) {
      out.push({
        name: "ds_query (POST /api/ds/query)",
        ok: false,
        detail: "permission denied — log queries will fail on Grafana <9.0",
      });
    } else {
      // Empty queries return 4xx but proves the endpoint exists
      out.push({
        name: "ds_query (POST /api/ds/query)",
        ok: true,
        detail: "available (probe endpoint reachable)",
      });
    }
  }

  return out;
}

function buildGuidance(caps: CapabilityResult[]): string {
  const cap = (n: string) => caps.find((c) => c.name.startsWith(n))?.ok ?? false;
  const list = cap("list_datasources");
  const proxy = cap("proxy_uid");
  if (list && proxy) {
    return "guidance: full auto-detection works. `query_logs(service=\"...\")` is sufficient.";
  }
  if (!list && proxy) {
    return "guidance: `query_logs(service=\"...\", datasource_uid=\"...\")` — auto-detect a service label, but provide datasource_uid.";
  }
  if (list && !proxy) {
    return "guidance: `query_logs(service=\"...\", service_label=\"...\")` — auto-pick datasource, but provide service_label.";
  }
  return "guidance: provide both datasource_uid and service_label (or use raw_logql with datasource_uid). Use extract_dashboard_queries to discover both from a dashboard URL.";
}

function truncate(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}
