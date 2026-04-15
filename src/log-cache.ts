import * as fs from "fs";
import * as path from "path";
import * as os from "os";
export type {
  CacheEntry,
  InstanceCacheData,
  LogCacheData,
  TtlConfig,
} from "@/interfaces/log-cache.js";
import type {
  CacheEntry,
  InstanceCacheData,
  LogCacheData,
  TtlConfig,
} from "@/interfaces/log-cache.js";
import type { GrafanaDataSource } from "@/interfaces/grafana-client.js";

const DEFAULT_CACHE_FILE = path.join(os.homedir(), ".grafana-mcp", "log-cache.json");

function resolveCachePath(): string | null {
  const raw = process.env.GRAFANA_MCP_CACHE;
  if (raw === "off" || raw === "false") return null;
  return process.env.GRAFANA_MCP_CACHE_PATH || DEFAULT_CACHE_FILE;
}

function resolveTtl(): TtlConfig {
  const num = (v: string | undefined, fallback: number): number => {
    if (!v) return fallback;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    datasourcesMs: num(process.env.GRAFANA_MCP_CACHE_TTL_DATASOURCES_MS, 24 * 3600_000),
    labelsMs: num(process.env.GRAFANA_MCP_CACHE_TTL_LABELS_MS, 24 * 3600_000),
    labelValuesMs: num(process.env.GRAFANA_MCP_CACHE_TTL_LABEL_VALUES_MS, 3600_000),
    serviceResolutionMs: num(process.env.GRAFANA_MCP_CACHE_TTL_SERVICE_MS, 3600_000),
  };
}

function isFresh<T>(entry: CacheEntry<T> | undefined, ttlMs: number): entry is CacheEntry<T> {
  if (!entry) return false;
  return Date.now() - entry.ts < ttlMs;
}

export class LogCache {
  private data: LogCacheData;
  private filePath: string | null;
  private ttl: TtlConfig;

  constructor() {
    this.filePath = resolveCachePath();
    this.ttl = resolveTtl();
    this.data = this.load();
  }

  isEnabled(): boolean {
    return this.filePath !== null;
  }

  getPath(): string | null {
    return this.filePath;
  }

  getTtl(): TtlConfig {
    return this.ttl;
  }

  private instance(url: string): InstanceCacheData {
    if (!this.data.instances[url]) this.data.instances[url] = {};
    return this.data.instances[url];
  }

  // --- Log datasources ---

  getLogDatasources(url: string): GrafanaDataSource[] | null {
    const entry = this.instance(url).logDatasources;
    return isFresh(entry, this.ttl.datasourcesMs) ? entry.data : null;
  }

  setLogDatasources(url: string, data: GrafanaDataSource[]): void {
    this.instance(url).logDatasources = { data, ts: Date.now() };
    this.save();
  }

  // --- Labels per datasource ---

  getLabels(url: string, dsUid: string): string[] | null {
    const entry = this.instance(url).labelsByDs?.[dsUid];
    return isFresh(entry, this.ttl.labelsMs) ? entry.data : null;
  }

  setLabels(url: string, dsUid: string, data: string[]): void {
    const inst = this.instance(url);
    if (!inst.labelsByDs) inst.labelsByDs = {};
    inst.labelsByDs[dsUid] = { data, ts: Date.now() };
    this.save();
  }

  // --- Label values per datasource+label ---

  getLabelValues(url: string, dsUid: string, label: string): string[] | null {
    const entry = this.instance(url).valuesByDsLabel?.[dsUid]?.[label];
    return isFresh(entry, this.ttl.labelValuesMs) ? entry.data : null;
  }

  setLabelValues(url: string, dsUid: string, label: string, data: string[]): void {
    const inst = this.instance(url);
    if (!inst.valuesByDsLabel) inst.valuesByDsLabel = {};
    if (!inst.valuesByDsLabel[dsUid]) inst.valuesByDsLabel[dsUid] = {};
    inst.valuesByDsLabel[dsUid][label] = { data, ts: Date.now() };
    this.save();
  }

  // --- Service resolution ---

  getServiceResolution(url: string, service: string): { dsUid: string; label: string } | null {
    const entry = this.instance(url).serviceResolution?.[service];
    return isFresh(entry, this.ttl.serviceResolutionMs) ? entry.data : null;
  }

  setServiceResolution(url: string, service: string, dsUid: string, label: string): void {
    const inst = this.instance(url);
    if (!inst.serviceResolution) inst.serviceResolution = {};
    inst.serviceResolution[service] = { data: { dsUid, label }, ts: Date.now() };
    this.save();
  }

  invalidateService(url: string, service: string): void {
    const inst = this.instance(url);
    if (inst.serviceResolution) {
      delete inst.serviceResolution[service];
      this.save();
    }
  }

  // --- Management ---

  clear(url?: string): void {
    if (url) {
      delete this.data.instances[url];
    } else {
      this.data = { instances: {} };
    }
    this.save();
  }

  getSummary(): string {
    const urls = Object.keys(this.data.instances);
    if (urls.length === 0) return "Log cache is empty.";
    const lines: string[] = [`Log cache at ${this.filePath ?? "(disabled)"}`];
    for (const url of urls) {
      const inst = this.data.instances[url];
      const dsCount = inst.logDatasources?.data.length ?? 0;
      const labelDsCount = inst.labelsByDs ? Object.keys(inst.labelsByDs).length : 0;
      const resolvedServices = inst.serviceResolution
        ? Object.keys(inst.serviceResolution).length
        : 0;
      lines.push(
        `- ${url}: ${dsCount} log datasources, labels for ${labelDsCount} ds, ${resolvedServices} resolved services`
      );
      if (inst.serviceResolution) {
        for (const [svc, entry] of Object.entries(inst.serviceResolution)) {
          lines.push(`    ${svc} → ds=${entry.data.dsUid}, label=${entry.data.label}`);
        }
      }
    }
    return lines.join("\n");
  }

  exportTo(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  importFrom(filePath: string, mode: "merge" | "replace" = "merge"): void {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<LogCacheData>;
    const incoming: LogCacheData = { instances: parsed.instances ?? {} };
    if (mode === "replace") {
      this.data = incoming;
    } else {
      this.data = {
        instances: { ...this.data.instances, ...incoming.instances },
      };
    }
    this.save();
  }

  private load(): LogCacheData {
    if (!this.filePath) return { instances: {} };
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<LogCacheData>;
        return { instances: parsed.instances ?? {} };
      }
    } catch {
      // corrupted, start fresh
    }
    return { instances: {} };
  }

  private save(): void {
    if (!this.filePath) return;
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = this.filePath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf-8");
    fs.renameSync(tmp, this.filePath);
  }
}
