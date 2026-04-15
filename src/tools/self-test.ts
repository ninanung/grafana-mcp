import type { GrafanaClient } from "@/grafana-client.js";
import type { ToolResult } from "@/interfaces/tools.js";

export async function handleSelfTest(
  client: GrafanaClient,
  instanceName: string
): Promise<ToolResult> {
  const lines: string[] = [];
  lines.push(`instance: ${instanceName}`);
  lines.push(`auth: ${client.getAuthDescription()}`);
  try {
    const health = await client.health();
    lines.push(`health: OK (version=${health.version ?? "unknown"}, database=${health.database ?? "unknown"})`);
  } catch (err) {
    lines.push(`health: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
