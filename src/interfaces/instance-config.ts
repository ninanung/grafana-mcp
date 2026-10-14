import type { AuthConfig } from "@/interfaces/grafana-client.js";

export type InstanceSource = "file" | "GRAFANA_INSTANCES" | "GRAFANA_URL";

export interface InstanceConfig {
  name?: string;
  url: string;
  service_account_token?: string;
  api_key?: string;
  cloud_access_policy_token?: string;
  username?: string;
  password?: string;
  org_id?: number | string;
  tls_skip_verify?: boolean;
}

export interface InstancesFileSource {
  entries: unknown[];
  defaultName?: string;
  mtimeMs: number;
}

export interface LoadedInstance {
  name: string;
  source: InstanceSource;
  url: string;
  auth: AuthConfig;
  orgId?: number;
  tlsSkipVerify: boolean;
}

export interface LoadedInstances {
  instances: LoadedInstance[];
  defaultName: string;
  filePath: string;
  fileMtimeMs: number | null;
}
