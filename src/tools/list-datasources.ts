import type { GrafanaClient } from "@/grafana-client.js";
import type { ToolResult } from "@/interfaces/tools.js";

export async function handleListDataSources(client: GrafanaClient): Promise<ToolResult> {
  const sources = await client.listDataSources();
  const summary = sources.map((s) => ({
    id: s.id,
    uid: s.uid,
    name: s.name,
    type: s.type,
    isDefault: s.isDefault ?? false,
  }));
  return {
    content: [
      { type: "text", text: JSON.stringify(summary, null, 2) },
    ],
  };
}
