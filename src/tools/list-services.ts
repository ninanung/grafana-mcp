import type { GrafanaClient } from "@/grafana-client.js";
import type { ToolResult } from "@/interfaces/tools.js";
import type { LogCache } from "@/log-cache.js";
import { LOG_DATASOURCE_TYPES, SERVICE_LABEL_CANDIDATES, parseTime } from "@/log-backends.js";
import { fetchLabelValues, fetchLokiLabels } from "@/loki.js";

export interface ListServicesArgs {
  datasource_uid?: string;
  time_from?: string;
  time_to?: string;
}

export async function handleListServices(
  args: ListServicesArgs,
  client: GrafanaClient,
  cache?: LogCache
): Promise<ToolResult> {
  const url = client.getBaseUrl();
  const now = Date.now();
  const startMs = parseTime(args.time_from ?? "now-1h", now);
  const endMs = parseTime(args.time_to ?? "now", now);

  let logSources = cache?.getLogDatasources(url);
  if (!logSources) {
    const all = await client.listDataSources();
    logSources = all.filter((d) => LOG_DATASOURCE_TYPES.has(d.type));
    cache?.setLogDatasources(url, logSources);
  }

  const lokiSources = logSources.filter((d) => d.type === "loki");
  if (lokiSources.length === 0) {
    return {
      content: [{ type: "text", text: "No Loki datasources found." }],
    };
  }

  const out: Array<{
    datasource: string;
    uid: string;
    label: string;
    services: string[];
  }> = [];

  for (const ds of lokiSources) {
    if (args.datasource_uid && ds.uid !== args.datasource_uid) continue;
    const labels = await fetchLokiLabels(client, ds.uid, startMs, endMs, cache);
    const label = SERVICE_LABEL_CANDIDATES.find((c) => labels.includes(c));
    if (!label) {
      out.push({ datasource: ds.name, uid: ds.uid, label: "(none)", services: [] });
      continue;
    }
    const values = await fetchLabelValues(client, ds.uid, label, startMs, endMs, cache);
    out.push({
      datasource: ds.name,
      uid: ds.uid,
      label,
      services: [...values].sort(),
    });
  }

  return {
    content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
  };
}
