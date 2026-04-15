export const LOG_DATASOURCE_TYPES = new Set([
  "loki",
  "elasticsearch",
  "cloudwatch",
  "grafana-opensearch-datasource",
  "grafana-splunk-datasource",
]);

export const SERVICE_LABEL_CANDIDATES = [
  "service",
  "service_name",
  "app",
  "app_name",
  "application",
  "container",
  "job",
];

export function parseTime(input: string | undefined, now: number = Date.now()): number {
  if (!input || input === "now") return now;
  const rel = input.match(/^now-(\d+)(s|m|h|d)$/);
  if (rel) {
    const n = Number(rel[1]);
    const mult: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return now - n * mult[rel[2]];
  }
  const parsed = Date.parse(input);
  if (!Number.isNaN(parsed)) return parsed;
  throw new Error(`Invalid time expression: ${input}`);
}
