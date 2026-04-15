import type { GrafanaClient } from "@/grafana-client.js";
import type { ToolResult } from "@/interfaces/tools.js";
import type { SearchDashboardsArgs } from "@/interfaces/tool-args.js";

export async function handleSearchDashboards(
  args: SearchDashboardsArgs,
  client: GrafanaClient
): Promise<ToolResult> {
  const hits = await client.searchDashboards({
    query: args.query,
    tag: args.tag,
    type: args.type ?? "dash-db",
    limit: args.limit ?? 50,
  });
  const summary = hits.map((h) => ({
    uid: h.uid,
    title: h.title,
    type: h.type,
    tags: h.tags,
    folder: h.folderTitle,
    url: h.url,
  }));
  return {
    content: [
      { type: "text", text: JSON.stringify(summary, null, 2) },
    ],
  };
}
