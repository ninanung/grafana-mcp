import type { ClientRegistry } from "@/client-registry.js";
import type { UseInstanceArgs } from "@/interfaces/tool-args.js";
import type { ToolResult } from "@/interfaces/tools.js";

export async function handleUseInstance(
  args: UseInstanceArgs,
  registry: ClientRegistry
): Promise<ToolResult> {
  if (typeof args.name !== "string" || !args.name.trim()) {
    return {
      content: [{ type: "text", text: "name is required. Use list_instances to see registered names." }],
      isError: true,
    };
  }

  const { previous, current } = registry.setActive(args.name);
  const url = current.client.getBaseUrl();
  const summary =
    previous.name === current.name
      ? `Active instance is already "${current.name}" (${url}).`
      : `Active instance: ${previous.name} → ${current.name} (${url}).`;

  return {
    content: [
      {
        type: "text",
        text: `${summary}\nCalls without \`instance\` now target "${current.name}". Run self_test to verify connectivity.`,
      },
    ],
  };
}
