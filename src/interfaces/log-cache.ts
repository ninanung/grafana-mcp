import type { GrafanaDataSource } from "@/interfaces/grafana-client.js";

export interface CacheEntry<T> {
  data: T;
  ts: number; // epoch ms
}

export interface InstanceCacheData {
  logDatasources?: CacheEntry<GrafanaDataSource[]>;
  labelsByDs?: Record<string, CacheEntry<string[]>>;
  valuesByDsLabel?: Record<string, Record<string, CacheEntry<string[]>>>;
  serviceResolution?: Record<string, CacheEntry<{ dsUid: string; label: string }>>;
}

export interface LogCacheData {
  // keyed by Grafana base URL
  instances: Record<string, InstanceCacheData>;
}

export interface TtlConfig {
  datasourcesMs: number;
  labelsMs: number;
  labelValuesMs: number;
  serviceResolutionMs: number;
}
