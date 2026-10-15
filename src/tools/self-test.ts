import type { GrafanaClient } from "@/grafana-client.js";
import type { CapabilityResult } from "@/interfaces/self-test.js";
import type { ToolResult } from "@/interfaces/tools.js";
import { isAuthError, isPermissionError } from "@/permission-error.js";

const AUTH_FAILED_DETAIL = "authentication failed (401) — credentials are invalid or expired";

export async function handleSelfTest(client: GrafanaClient): Promise<ToolResult> {
  const lines: string[] = [];
  lines.push(`url: ${client.getBaseUrl()}`);
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

  const authFailed = caps.some((c) => c.authFailed);
  return { content: [{ type: "text", text: lines.join("\n") }], isError: authFailed };
}

async function probeCapabilities(client: GrafanaClient): Promise<CapabilityResult[]> {
  const out: CapabilityResult[] = [];

  // 1) datasource list — /api/datasources, falling back to /api/frontend/settings
  let lokiUid: string | undefined;
  try {
    const { sources, via } = await client.listDataSourcesDetailed();
    lokiUid = sources.find((d) => d.type === "loki")?.uid;
    out.push({
      name: "list_datasources",
      ok: true,
      detail:
        via === "frontend_settings"
          ? `${sources.length} datasource(s) visible via /api/frontend/settings (/api/datasources denied) — auto-detection paths available`
          : `${sources.length} datasource(s) visible — auto-detection paths available`,
    });
  } catch (err) {
    if (isAuthError(err)) {
      out.push({ name: "list_datasources", ok: false, detail: AUTH_FAILED_DETAIL, authFailed: true });
    } else {
      const reason = isPermissionError(err)
        ? "permission denied on /api/datasources and /api/frontend/settings"
        : truncate(err);
      out.push({
        name: "list_datasources",
        ok: false,
        detail: `${reason} — supply datasource_uid explicitly for log queries`,
      });
    }
  }

  // 2) datasource proxy for Loki labels (uid route on Grafana 9.0+, numeric id route below)
  out.push(await probeLabelProxy(client, lokiUid));

  // 3) /api/ds/query — universal viewer-friendly query path
  try {
    await client.queryDatasource({ queries: [], from: "0", to: "0" });
    out.push({
      name: "ds_query (POST /api/ds/query)",
      ok: true,
      detail: "available — used as fallback when the datasource proxy is unavailable",
    });
  } catch (err) {
    if (isAuthError(err)) {
      out.push({ name: "ds_query (POST /api/ds/query)", ok: false, detail: AUTH_FAILED_DETAIL, authFailed: true });
    } else if (isPermissionError(err)) {
      out.push({
        name: "ds_query (POST /api/ds/query)",
        ok: false,
        detail: "permission denied — no fallback when the datasource proxy is unavailable",
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

async function probeLabelProxy(client: GrafanaClient, lokiUid: string | undefined): Promise<CapabilityResult> {
  const name = "datasource_proxy (labels/values)";
  if (!lokiUid) {
    return {
      name,
      ok: false,
      detail: "skipped — no Loki datasource visible to probe; supply service_label explicitly or use raw_logql",
    };
  }
  const endNs = Date.now() * 1_000_000;
  try {
    await client.proxyGet(lokiUid, "/loki/api/v1/labels", { start: endNs - 3_600_000 * 1_000_000, end: endNs });
    return {
      name,
      ok: true,
      detail:
        client.getProxyRoute() === "id"
          ? "uid route unsupported (Grafana <9.0) — using id-based proxy; service_label auto-detect available"
          : "uid-based proxy works — service_label auto-detect available",
    };
  } catch (err) {
    if (isAuthError(err)) return { name, ok: false, detail: AUTH_FAILED_DETAIL, authFailed: true };
    const reason = isPermissionError(err) ? "permission denied" : truncate(err);
    return { name, ok: false, detail: `${reason} — supply service_label explicitly or use raw_logql` };
  }
}

function buildGuidance(caps: CapabilityResult[]): string {
  if (caps.some((c) => c.authFailed)) {
    return "guidance: Grafana rejected the credentials (401). Replace the token/password for this instance (e.g. issue a new service account token or API key); no query will work until then.";
  }
  const cap = (n: string) => caps.find((c) => c.name.startsWith(n))?.ok ?? false;
  const list = cap("list_datasources");
  const proxy = cap("datasource_proxy");
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
