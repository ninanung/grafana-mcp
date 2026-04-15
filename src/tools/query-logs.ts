import type { GrafanaClient } from "@/grafana-client.js";
import type { GrafanaDataSource } from "@/interfaces/grafana-client.js";
import type { ToolResult } from "@/interfaces/tools.js";
import type { QueryLogsArgs } from "@/interfaces/tool-args.js";
import type { LogLine } from "@/interfaces/loki.js";
import type { LogCache } from "@/log-cache.js";
import { LOG_DATASOURCE_TYPES, SERVICE_LABEL_CANDIDATES, parseTime } from "@/log-backends.js";
import {
  detectServiceLabel,
  fetchLabelValues,
  fetchLokiLabels,
  buildLogQL,
  queryLokiRange,
} from "@/loki.js";
import { suggestClosest } from "@/fuzzy-match.js";

interface ResolvedTarget {
  datasource: GrafanaDataSource;
  serviceLabel: string;
  fromCache: boolean;
}

async function getLogDatasources(
  client: GrafanaClient,
  cache?: LogCache,
  refresh?: boolean
): Promise<GrafanaDataSource[]> {
  const url = client.getBaseUrl();
  if (!refresh) {
    const cached = cache?.getLogDatasources(url);
    if (cached) return cached;
  }
  const all = await client.listDataSources();
  const logs = all.filter((d) => LOG_DATASOURCE_TYPES.has(d.type));
  cache?.setLogDatasources(url, logs);
  return logs;
}

async function resolveTarget(
  client: GrafanaClient,
  args: QueryLogsArgs,
  startMs: number,
  endMs: number,
  cache?: LogCache
): Promise<ResolvedTarget> {
  const url = client.getBaseUrl();

  if (!args.refresh && !args.datasource_uid && !args.service_label) {
    const cached = cache?.getServiceResolution(url, args.service);
    if (cached) {
      const logs = await getLogDatasources(client, cache);
      const ds = logs.find((d) => d.uid === cached.dsUid);
      if (ds) {
        return { datasource: ds, serviceLabel: cached.label, fromCache: true };
      }
    }
  }

  const logSources = await getLogDatasources(client, cache, args.refresh);
  if (logSources.length === 0) {
    throw new Error("No log-type datasources found on this Grafana instance.");
  }

  const candidates = args.datasource_uid
    ? logSources.filter((d) => d.uid === args.datasource_uid)
    : logSources;
  if (candidates.length === 0) {
    throw new Error(`datasource_uid ${args.datasource_uid} is not a log datasource.`);
  }

  const lokiCandidates = candidates.filter((d) => d.type === "loki");
  if (lokiCandidates.length === 0) {
    throw new Error(
      `Auto-detection currently supports Loki only. Found types: ${candidates.map((c) => c.type).join(", ")}. Specify datasource_uid and service_label manually, or open a request for backend support.`
    );
  }

  if (args.service_label) {
    const ds = lokiCandidates[0];
    cache?.setServiceResolution(url, args.service, ds.uid, args.service_label);
    return { datasource: ds, serviceLabel: args.service_label, fromCache: false };
  }

  const matches: Array<{ datasource: GrafanaDataSource; serviceLabel: string }> = [];
  for (const ds of lokiCandidates) {
    const label = await detectServiceLabel(client, ds.uid, args.service, startMs, endMs, cache);
    if (label) matches.push({ datasource: ds, serviceLabel: label });
  }

  if (matches.length === 0) {
    const suggestions = await collectSuggestions(
      client,
      lokiCandidates.map((d) => d.uid),
      args.service,
      startMs,
      endMs,
      cache
    );
    const hint = suggestions.length > 0
      ? ` Did you mean: ${suggestions.join(", ")}?`
      : "";
    throw new Error(
      `Service "${args.service}" not found in any Loki datasource labels in the given time range.${hint} Try a wider time_from, run list_services, or verify the service name.`
    );
  }
  if (matches.length > 1) {
    const names = matches
      .map((m) => `${m.datasource.name} (uid=${m.datasource.uid}, label=${m.serviceLabel})`)
      .join(", ");
    throw new Error(
      `Service "${args.service}" matches multiple datasources: ${names}. Specify datasource_uid to disambiguate.`
    );
  }
  const picked = matches[0];
  cache?.setServiceResolution(url, args.service, picked.datasource.uid, picked.serviceLabel);
  return { ...picked, fromCache: false };
}

async function collectSuggestions(
  client: GrafanaClient,
  dsUids: string[],
  service: string,
  startMs: number,
  endMs: number,
  cache?: LogCache
): Promise<string[]> {
  const pool = new Set<string>();
  for (const uid of dsUids) {
    try {
      const labels = await fetchLokiLabels(client, uid, startMs, endMs, cache);
      for (const candidate of SERVICE_LABEL_CANDIDATES) {
        if (!labels.includes(candidate)) continue;
        try {
          const values = await fetchLabelValues(client, uid, candidate, startMs, endMs, cache);
          for (const v of values) pool.add(v);
        } catch {
          // skip this label
        }
      }
    } catch {
      // skip this ds
    }
  }
  return suggestClosest(service, [...pool]);
}

function normalizePattern(line: string): string {
  return line
    .replace(/\b\d+\b/g, "N")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "UUID")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function renderRaw(lines: LogLine[]): string {
  return lines.map((l) => `${l.timestampIso}  ${l.line}`).join("\n");
}

function renderSummarize(lines: LogLine[]): string {
  const groups = new Map<string, { count: number; sample: LogLine }>();
  for (const l of lines) {
    const key = normalizePattern(l.line);
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { count: 1, sample: l });
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].count - a[1].count);
  const out: string[] = [`Total lines: ${lines.length}, unique patterns: ${sorted.length}`, ""];
  for (const [pattern, { count, sample }] of sorted) {
    out.push(`[${count}x] ${pattern}`);
    out.push(`   e.g. ${sample.timestampIso}  ${sample.line.slice(0, 200)}`);
    out.push("");
  }
  return out.join("\n");
}

function renderJson(lines: LogLine[]): string {
  return JSON.stringify(
    lines.map((l) => ({ ts: l.timestampIso, line: l.line, labels: l.labels })),
    null,
    2
  );
}

export async function handleQueryLogs(
  args: QueryLogsArgs,
  client: GrafanaClient,
  cache?: LogCache
): Promise<ToolResult> {
  if (!args.service) {
    return {
      content: [{ type: "text", text: "service is required." }],
      isError: true,
    };
  }

  const now = Date.now();
  const startMs = parseTime(args.time_from ?? "now-1h", now);
  const endMs = parseTime(args.time_to ?? "now", now);
  if (startMs >= endMs) {
    return {
      content: [{ type: "text", text: "time_from must be earlier than time_to." }],
      isError: true,
    };
  }

  const limit = args.limit ?? 100;
  const output = args.output ?? "raw";

  let target: ResolvedTarget;
  try {
    target = await resolveTarget(client, args, startMs, endMs, cache);
  } catch (err) {
    // invalidate stale service resolution on failure, let the next call re-detect
    if (cache) cache.invalidateService(client.getBaseUrl(), args.service);
    throw err;
  }

  const logql = buildLogQL(target.serviceLabel, args.service, args.level, args.keyword);

  let lines: LogLine[];
  try {
    lines = await queryLokiRange(
      client,
      target.datasource.uid,
      logql,
      startMs,
      endMs,
      limit
    );
  } catch (err) {
    // cached resolution might be stale; drop it so the next call re-detects
    if (target.fromCache && cache) {
      cache.invalidateService(client.getBaseUrl(), args.service);
    }
    throw err;
  }

  const header = [
    `datasource: ${target.datasource.name} (uid=${target.datasource.uid}, type=${target.datasource.type})${target.fromCache ? " [cached]" : " [fresh]"}`,
    `selector: ${target.serviceLabel}="${args.service}"`,
    `logql: ${logql}`,
    `range: ${new Date(startMs).toISOString()} → ${new Date(endMs).toISOString()}`,
    `returned: ${lines.length} line(s)`,
    "",
  ].join("\n");

  let body: string;
  switch (output) {
    case "summarize":
      body = renderSummarize(lines);
      break;
    case "json":
      body = renderJson(lines);
      break;
    case "raw":
    default:
      body = renderRaw(lines);
      break;
  }

  return {
    content: [{ type: "text", text: header + body }],
  };
}
