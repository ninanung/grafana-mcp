export type {
  AuthConfig,
  AuthMode,
  GrafanaClientOptions,
  GrafanaHealth,
  GrafanaDataSource,
  GrafanaDashboardSearchHit,
  GrafanaDashboardDetail,
} from "@/interfaces/grafana-client.js";
import type {
  AuthConfig,
  GrafanaClientOptions,
  GrafanaHealth,
  GrafanaDataSource,
  GrafanaDashboardSearchHit,
  GrafanaDashboardDetail,
} from "@/interfaces/grafana-client.js";

export class GrafanaClient {
  private baseUrl: string;
  private auth: AuthConfig;
  private timeout: number;
  private orgId?: number;

  constructor(baseUrl: string, auth: AuthConfig, options: GrafanaClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.auth = auth;
    this.timeout = options.timeout ?? 30000;
    this.orgId = options.orgId;

    if (options.tlsSkipVerify) {
      // Node-specific: let Node skip TLS verification for self-signed Grafana.
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getAuthDescription(): string {
    if (this.auth.mode === "bearer") {
      return `bearer (${this.auth.tokenKind ?? "token"})`;
    }
    return "basic";
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...extra,
    };
    if (this.auth.mode === "bearer" && this.auth.token) {
      headers.Authorization = `Bearer ${this.auth.token}`;
    } else if (this.auth.mode === "basic" && this.auth.username && this.auth.password) {
      const encoded = Buffer.from(`${this.auth.username}:${this.auth.password}`).toString("base64");
      headers.Authorization = `Basic ${encoded}`;
    }
    if (this.orgId) headers["X-Grafana-Org-Id"] = String(this.orgId);
    return headers;
  }

  async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; query?: Record<string, unknown> } = {}
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
          for (const item of v) url.searchParams.append(k, String(item));
        } else {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url.toString(), {
        method,
        headers: this.buildHeaders(
          options.body ? { "Content-Type": "application/json" } : undefined
        ),
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(
          `Grafana API ${method} ${path} failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`
        );
      }
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  health(): Promise<GrafanaHealth> {
    return this.request<GrafanaHealth>("GET", "/api/health");
  }

  listDataSources(): Promise<GrafanaDataSource[]> {
    return this.request<GrafanaDataSource[]>("GET", "/api/datasources");
  }

  searchDashboards(params: {
    query?: string;
    tag?: string[];
    type?: string;
    limit?: number;
  }): Promise<GrafanaDashboardSearchHit[]> {
    return this.request<GrafanaDashboardSearchHit[]>("GET", "/api/search", {
      query: params,
    });
  }

  getDashboard(uid: string): Promise<GrafanaDashboardDetail> {
    return this.request<GrafanaDashboardDetail>("GET", `/api/dashboards/uid/${encodeURIComponent(uid)}`);
  }

  queryDatasource(payload: unknown): Promise<unknown> {
    return this.request<unknown>("POST", "/api/ds/query", { body: payload });
  }

  proxyGet<T>(datasourceUid: string, subPath: string, query?: Record<string, unknown>): Promise<T> {
    const path = `/api/datasources/proxy/uid/${encodeURIComponent(datasourceUid)}${subPath}`;
    return this.request<T>("GET", path, { query });
  }
}
