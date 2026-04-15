import type { GrafanaClient } from "@/grafana-client.js";
import type { ToolResult } from "@/interfaces/tools.js";
import type { GetDashboardArgs } from "@/interfaces/tool-args.js";

export async function handleGetDashboard(
  args: GetDashboardArgs,
  client: GrafanaClient
): Promise<ToolResult> {
  if (!args.uid) {
    return {
      content: [{ type: "text", text: "uid is required." }],
      isError: true,
    };
  }
  const detail = await client.getDashboard(args.uid);
  return {
    content: [
      { type: "text", text: JSON.stringify(detail, null, 2) },
    ],
  };
}
