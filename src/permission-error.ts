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
  const easiest =
    "Easiest: ask the user for a Grafana dashboard URL that already shows the logs they care about (e.g. https://<grafana>/d/<uid>/...), then call `extract_dashboard_queries` with that uid to read off `datasource_uid` (and a ready-to-use LogQL `expr` for `raw_logql`).";
  const alternatives =
    "Alternatives: (a) the user can paste the full LogQL expression from a panel and you pass it via `raw_logql`; (b) read `datasource.uid` from an exported dashboard JSON; (c) copy the UID segment from the Grafana UI at `/datasources/edit/{UID}`.";
  return `${how} Retry with \`${requiredArg}\` provided explicitly. ${easiest} ${alternatives}`;
}
