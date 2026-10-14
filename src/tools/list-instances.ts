import type { ClientRegistry, InstanceContext } from "@/client-registry.js";
import type { ToolResult } from "@/interfaces/tools.js";

function describe(ctx: InstanceContext, activeName: string, defaultName: string): string {
  const flags = [
    ctx.name === activeName ? "active" : null,
    ctx.name === defaultName ? "default" : null,
  ].filter((f): f is string => f !== null);
  const marker = ctx.name === activeName ? "*" : " ";
  const details = [
    ctx.client.getBaseUrl(),
    `auth=${ctx.client.getAuthDescription()}`,
    ctx.orgId ? `org_id=${ctx.orgId}` : null,
    ctx.tlsSkipVerify ? "tls_skip_verify" : null,
    `source=${ctx.source}`,
  ].filter((d): d is string => d !== null);
  const flagText = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
  return `${marker} ${ctx.name}${flagText} — ${details.join(" · ")}`;
}

export async function handleListInstances(registry: ClientRegistry): Promise<ToolResult> {
  const instances = registry.list();
  const activeName = registry.getActive().name;
  const defaultName = registry.getDefault().name;

  const lines = [
    `${instances.length} Grafana instance(s) registered (instances file: ${registry.getFilePath()})`,
    "",
    ...instances.map((ctx) => describe(ctx, activeName, defaultName)),
    "",
    "Switch with use_instance, or pass `instance` to a tool for a one-off call.",
  ];
  const tlsWarning = registry.getTlsWarning();
  if (tlsWarning) lines.push(`Warning: ${tlsWarning}`);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
