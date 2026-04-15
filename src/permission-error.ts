export function isPermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b403\b|Permission denied|Forbidden/i.test(msg);
}

export function isProxyUidUnsupported(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /proxy\/uid\/.*(400|404)/.test(msg) || /id is invalid/i.test(msg);
}

export function permissionHint(operation: "list_datasources" | "list_services", requiredArg: string): string {
  const how =
    operation === "list_datasources"
      ? "Listing datasources requires Editor/Admin permission on this Grafana instance."
      : "Auto-detecting the service label requires permission this API key lacks.";
  return `${how} Retry with \`${requiredArg}\` provided explicitly. You can find a Loki datasource uid in a dashboard JSON (datasource.uid) or the Grafana UI at /datasources/edit/{UID}.`;
}
