import type { GrafanaClient } from "@/grafana-client.js";
import type { ToolResult } from "@/interfaces/tools.js";

export async function handleListDataSources(client: GrafanaClient): Promise<ToolResult> {
  const { sources, via } = await client.listDataSourcesDetailed();
  const summary = sources.map((s) => ({
    id: s.id,
    uid: s.uid,
    name: s.name,
    type: s.type,
    isDefault: s.isDefault ?? false,
  }));
  const json = JSON.stringify(summary, null, 2);
  const text =
    via === "frontend_settings"
      ? `Note: /api/datasources is not permitted for this key; listed from /api/frontend/settings instead.\n${json}`
      : json;
  return {
    content: [{ type: "text", text }],
  };
}
