import type { GrafanaClient } from "@/grafana-client.js";
import type { ToolResult } from "@/interfaces/tools.js";
import { LOG_DATASOURCE_TYPES } from "@/log-backends.js";

interface ExtractedQuery {
  panel_id: number;
  panel_title: string;
  datasource_uid: string;
  datasource_type: string;
  expr: string;
  is_log_query: boolean;
}

export interface ExtractDashboardQueriesArgs {
  uid: string;
  log_only?: boolean;
}

export async function handleExtractDashboardQueries(
  args: ExtractDashboardQueriesArgs,
  client: GrafanaClient
): Promise<ToolResult> {
  if (!args.uid) {
    return { content: [{ type: "text", text: "uid is required." }], isError: true };
  }

  const detail = await client.getDashboard(args.uid);
  const board = (detail as { dashboard?: unknown }).dashboard as {
    panels?: PanelLike[];
  } | undefined;
  if (!board?.panels) {
    return { content: [{ type: "text", text: "Dashboard has no panels." }] };
  }

  const out: ExtractedQuery[] = [];
  walkPanels(board.panels, out);

  const filtered = args.log_only ? out.filter((q) => q.is_log_query) : out;

  return {
    content: [
      {
        type: "text",
        text: `${filtered.length} ${args.log_only ? "log " : ""}query/queries extracted (dashboard uid=${args.uid}):\n\n${JSON.stringify(filtered, null, 2)}`,
      },
    ],
  };
}

interface PanelLike {
  id?: number;
  title?: string;
  type?: string;
  panels?: PanelLike[];
  targets?: TargetLike[];
}

interface TargetLike {
  expr?: string;
  query?: string;
  datasource?: { type?: string; uid?: string } | string;
  refId?: string;
}

function walkPanels(panels: PanelLike[], out: ExtractedQuery[]): void {
  for (const panel of panels) {
    if (panel.panels) walkPanels(panel.panels, out);
    if (!panel.targets) continue;
    for (const target of panel.targets) {
      const expr = target.expr ?? target.query;
      if (!expr || typeof expr !== "string") continue;
      const ds = typeof target.datasource === "object" ? target.datasource : undefined;
      const dsType = ds?.type ?? "";
      const dsUid = ds?.uid ?? "";
      if (!dsUid) continue;
      out.push({
        panel_id: panel.id ?? -1,
        panel_title: panel.title ?? "",
        datasource_uid: dsUid,
        datasource_type: dsType,
        expr,
        is_log_query: LOG_DATASOURCE_TYPES.has(dsType),
      });
    }
  }
}
