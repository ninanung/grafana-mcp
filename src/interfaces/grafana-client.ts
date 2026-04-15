export type AuthMode = "bearer" | "basic";

export interface AuthConfig {
  mode: AuthMode;
  // For bearer: Service Account Token / API Key / Cloud Access Policy Token
  token?: string;
  tokenKind?: "service_account" | "api_key" | "cloud_access_policy";
  // For basic
  username?: string;
  password?: string;
}

export interface GrafanaClientOptions {
  timeout?: number;
  orgId?: number;
  tlsSkipVerify?: boolean;
}

export interface GrafanaHealth {
  commit?: string;
  database?: string;
  version?: string;
}

export interface GrafanaDataSource {
  id: number;
  uid: string;
  name: string;
  type: string;
  url?: string;
  access?: string;
  isDefault?: boolean;
}

export interface GrafanaDashboardSearchHit {
  id: number;
  uid: string;
  title: string;
  type: string;
  tags?: string[];
  folderId?: number;
  folderTitle?: string;
  url?: string;
}

export interface GrafanaDashboardDetail {
  dashboard: Record<string, unknown>;
  meta: Record<string, unknown>;
}
