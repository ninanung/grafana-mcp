export type {
  AuthConfig,
  AuthMode,
  GrafanaClientOptions,
  GrafanaHealth,
  GrafanaDataSource,
  GrafanaDashboardSearchHit,
  GrafanaDashboardDetail,
  DataSourceListResult,
  DataSourceListVia,
  ProxyRoute,
} from "@/interfaces/grafana-client.js";
import type {
  AuthConfig,
  GrafanaClientOptions,
  GrafanaHealth,
  GrafanaDataSource,
  GrafanaDashboardSearchHit,
  GrafanaDashboardDetail,
  DataSourceListResult,
  DataSourceListVia,
  ProxyRoute,
} from "@/interfaces/grafana-client.js";
import { dataSourcesFromFrontendSettings } from "@/frontend-settings.js";
import { isPermissionError, isUidProxyRouteMissing } from "@/permission-error.js";

export class GrafanaClient {
  private baseUrl: string;
  private auth: AuthConfig;
  private timeout: number;
  private orgId?: number;
  private proxyRoute: ProxyRoute = "uid";
  private dataSourceIds = new Map<string, number>();

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

  getCacheKey(): string {
    return this.orgId ? `${this.baseUrl}#org=${this.orgId}` : this.baseUrl;
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

  async listDataSourcesDetailed(): Promise<DataSourceListResult> {
    let sources: GrafanaDataSource[];
    let via: DataSourceListVia;
    try {
      sources = await this.request<GrafanaDataSource[]>("GET", "/api/datasources");
      via = "datasources_api";
    } catch (err) {
      if (!isPermissionError(err)) throw err;
      // Keys without datasource read permission get 403 here; frontend settings lists datasources to any signed-in user.
      sources = await this.listDataSourcesFromFrontendSettings(err);
      via = "frontend_settings";
    }
    for (const ds of sources) {
      if (ds.id !== undefined) this.dataSourceIds.set(ds.uid, ds.id);
    }
    return { sources, via };
  }

  async listDataSources(): Promise<GrafanaDataSource[]> {
    return (await this.listDataSourcesDetailed()).sources;
  }

  private async listDataSourcesFromFrontendSettings(denied: unknown): Promise<GrafanaDataSource[]> {
    try {
      const settings = await this.request<unknown>("GET", "/api/frontend/settings");
      return dataSourcesFromFrontendSettings(settings);
    } catch (fallbackErr) {
      const deniedMsg = denied instanceof Error ? denied.message : String(denied);
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(`${deniedMsg} (fallback /api/frontend/settings also failed: ${fallbackMsg})`);
    }
  }

  getDataSourceByUid(uid: string): Promise<GrafanaDataSource> {
    return this.request<GrafanaDataSource>(
      "GET",
      `/api/datasources/uid/${encodeURIComponent(uid)}`
    );
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

  getProxyRoute(): ProxyRoute {
    return this.proxyRoute;
  }

  async proxyGet<T>(datasourceUid: string, subPath: string, query?: Record<string, unknown>): Promise<T> {
    if (this.proxyRoute === "uid") {
      try {
        const path = `/api/datasources/proxy/uid/${encodeURIComponent(datasourceUid)}${subPath}`;
        return await this.request<T>("GET", path, { query });
      } catch (err) {
        if (!isUidProxyRouteMissing(err)) throw err;
        this.proxyRoute = "id";
      }
    }
    const id = await this.resolveDataSourceId(datasourceUid);
    return this.request<T>("GET", `/api/datasources/proxy/${id}${subPath}`, { query });
  }

  private async resolveDataSourceId(uid: string): Promise<number> {
    const known = this.dataSourceIds.get(uid);
    if (known !== undefined) return known;
    await this.listDataSourcesDetailed();
    const id = this.dataSourceIds.get(uid);
    if (id === undefined) {
      throw new Error(
        `Datasource uid "${uid}" was not found on this Grafana instance. Grafana <9.0 proxies by numeric id, so the uid must resolve to an id — check it with list_log_datasources.`
      );
    }
    return id;
  }
}
