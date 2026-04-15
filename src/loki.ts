import type { GrafanaClient } from "@/grafana-client.js";
import type { LogCache } from "@/log-cache.js";
import type {
  LokiLabelsResponse,
  LokiLabelValuesResponse,
  LokiQueryRangeResponse,
  LogLine,
} from "@/interfaces/loki.js";
import { SERVICE_LABEL_CANDIDATES } from "@/log-backends.js";

export async function fetchLokiLabels(
  client: GrafanaClient,
  dsUid: string,
  startMs: number,
  endMs: number,
  cache?: LogCache
): Promise<string[]> {
  const url = client.getBaseUrl();
  const cached = cache?.getLabels(url, dsUid);
  if (cached) return cached;

  const res = await client.proxyGet<LokiLabelsResponse>(dsUid, "/loki/api/v1/labels", {
    start: startMs * 1_000_000,
    end: endMs * 1_000_000,
  });
  const data = res.data ?? [];
  cache?.setLabels(url, dsUid, data);
  return data;
}

export async function fetchLabelValues(
  client: GrafanaClient,
  dsUid: string,
  label: string,
  startMs: number,
  endMs: number,
  cache?: LogCache
): Promise<string[]> {
  const url = client.getBaseUrl();
  const cached = cache?.getLabelValues(url, dsUid, label);
  if (cached) return cached;

  const res = await client.proxyGet<LokiLabelValuesResponse>(
    dsUid,
    `/loki/api/v1/label/${encodeURIComponent(label)}/values`,
    {
      start: startMs * 1_000_000,
      end: endMs * 1_000_000,
    }
  );
  const data = res.data ?? [];
  cache?.setLabelValues(url, dsUid, label, data);
  return data;
}

export async function detectServiceLabel(
  client: GrafanaClient,
  dsUid: string,
  service: string,
  startMs: number,
  endMs: number,
  cache?: LogCache
): Promise<string | null> {
  const labels = await fetchLokiLabels(client, dsUid, startMs, endMs, cache);
  const ordered = [
    ...SERVICE_LABEL_CANDIDATES.filter((c) => labels.includes(c)),
    ...labels.filter((l) => !SERVICE_LABEL_CANDIDATES.includes(l)),
  ];
  for (const label of ordered) {
    try {
      const values = await fetchLabelValues(client, dsUid, label, startMs, endMs, cache);
      if (values.includes(service)) return label;
    } catch {
      // ignore label that fails to resolve
    }
  }
  return null;
}

export function buildLogQL(
  serviceLabel: string,
  service: string,
  level?: string,
  keyword?: string
): string {
  const selector = `{${serviceLabel}=${JSON.stringify(service)}}`;
  const filters: string[] = [];
  if (level) filters.push(`|~ "(?i)\\\\b${escapeRegex(level)}\\\\b"`);
  if (keyword) filters.push(`|~ "(?i)${escapeRegex(keyword)}"`);
  return [selector, ...filters].join(" ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function queryLokiRange(
  client: GrafanaClient,
  dsUid: string,
  logql: string,
  startMs: number,
  endMs: number,
  limit: number
): Promise<LogLine[]> {
  try {
    const res = await client.proxyGet<LokiQueryRangeResponse>(
      dsUid,
      "/loki/api/v1/query_range",
      {
        query: logql,
        start: startMs * 1_000_000,
        end: endMs * 1_000_000,
        limit,
        direction: "backward",
      }
    );

    const out: LogLine[] = [];
    for (const stream of res.data?.result ?? []) {
      for (const [tsNs, line] of stream.values) {
        out.push({
          timestampNs: tsNs,
          timestampIso: new Date(Number(BigInt(tsNs) / 1_000_000n)).toISOString(),
          line,
          labels: stream.stream,
        });
      }
    }
    out.sort((a, b) => (a.timestampNs < b.timestampNs ? 1 : -1));
    return out.slice(0, limit);
  } catch (err) {
    if (!isProxyUidUnsupported(err)) throw err;
    // Fallback for Grafana <9.0 or environments where uid-proxy is unavailable.
    return queryLokiViaDsQuery(client, dsUid, logql, startMs, endMs, limit);
  }
}

async function queryLokiViaDsQuery(
  client: GrafanaClient,
  dsUid: string,
  logql: string,
  startMs: number,
  endMs: number,
  limit: number
): Promise<LogLine[]> {
  const payload = {
    queries: [
      {
        refId: "A",
        datasource: { uid: dsUid, type: "loki" },
        expr: logql,
        queryType: "range",
        maxLines: limit,
        direction: "backward",
      },
    ],
    from: String(startMs),
    to: String(endMs),
  };
  const res = await client.queryDatasource(payload) as {
    results?: Record<string, {
      frames?: Array<{
        schema?: { name?: string; fields?: Array<{ name: string; type?: string }> };
        data?: { values?: unknown[][] };
      }>;
      error?: string;
    }>;
  };
  const result = res.results?.A;
  if (!result) return [];
  if (result.error) throw new Error(`Loki query error: ${result.error}`);

  const out: LogLine[] = [];
  for (const frame of result.frames ?? []) {
    const labels = parseStreamLabels(frame.schema?.name);
    const fields = frame.schema?.fields ?? [];
    const values = frame.data?.values ?? [];
    const timeIdx = fields.findIndex((f) => f.name === "Time" || f.name === "timestamp");
    const lineIdx = fields.findIndex((f) => f.name === "Line" || f.name === "line");
    const tsNsIdx = fields.findIndex((f) => f.name === "tsNs" || f.name === "TS");
    if (timeIdx < 0 || lineIdx < 0) continue;
    const times = values[timeIdx] as number[];
    const lines = values[lineIdx] as string[];
    const tsNsCol = tsNsIdx >= 0 ? (values[tsNsIdx] as string[]) : undefined;
    for (let i = 0; i < times.length; i++) {
      const ms = Number(times[i]);
      const tsNs = tsNsCol?.[i] ?? `${ms}000000`;
      out.push({
        timestampNs: tsNs,
        timestampIso: new Date(ms).toISOString(),
        line: lines[i],
        labels,
      });
    }
  }
  out.sort((a, b) => (a.timestampNs < b.timestampNs ? 1 : -1));
  return out.slice(0, limit);
}

function parseStreamLabels(name?: string): Record<string, string> {
  if (!name) return {};
  const m = name.match(/^\{(.*)\}$/s);
  if (!m) return {};
  const out: Record<string, string> = {};
  const re = /(\w+)\s*=\s*"((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = re.exec(m[1])) !== null) {
    out[match[1]] = match[2].replace(/\\"/g, '"');
  }
  return out;
}

function isProxyUidUnsupported(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /proxy\/uid\/.*(400|404)/.test(msg) || /id is invalid/i.test(msg);
}
