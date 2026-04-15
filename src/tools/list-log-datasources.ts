import type { GrafanaClient } from "@/grafana-client.js";
import type { ToolResult } from "@/interfaces/tools.js";
import type { LogCache } from "@/log-cache.js";
import { LOG_DATASOURCE_TYPES } from "@/log-backends.js";
import { isPermissionError, permissionHint } from "@/permission-error.js";

export async function handleListLogDataSources(
  client: GrafanaClient,
  cache?: LogCache
): Promise<ToolResult> {
  const url = client.getBaseUrl();
  const cached = cache?.getLogDatasources(url);
  let sources;
  if (cached) {
    sources = cached;
  } else {
    try {
      sources = (await client.listDataSources()).filter((d) => LOG_DATASOURCE_TYPES.has(d.type));
    } catch (err) {
      if (isPermissionError(err)) {
        return {
          content: [{ type: "text", text: permissionHint("list_datasources", "datasource_uid") }],
          isError: true,
        };
      }
      throw err;
    }
    if (cache) cache.setLogDatasources(url, sources);
  }

  const summary = sources.map((d) => ({
    uid: d.uid,
    name: d.name,
    type: d.type,
    isDefault: d.isDefault ?? false,
  }));
  const tag = cached ? "[cached]" : "[fresh]";
  return {
    content: [
      { type: "text", text: `${tag} ${summary.length} log datasource(s)\n${JSON.stringify(summary, null, 2)}` },
    ],
  };
}
