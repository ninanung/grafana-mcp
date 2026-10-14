import type { GrafanaClient } from "@/grafana-client.js";
import type { InstanceSource } from "@/interfaces/instance-config.js";

export interface InstanceContext {
  name: string;
  source: InstanceSource;
  client: GrafanaClient;
  orgId?: number;
  tlsSkipVerify: boolean;
}

export interface RegistryState {
  // Keyed by lowercased name so lookups are case-insensitive.
  instances: Map<string, InstanceContext>;
  defaultKey: string;
  filePath: string;
  fileMtimeMs: number | null;
}

export interface ActiveSwitch {
  previous: InstanceContext;
  current: InstanceContext;
}
