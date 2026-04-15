import { GrafanaClient } from "@/grafana-client.js";
import type { AuthConfig } from "@/interfaces/grafana-client.js";

export interface InstanceContext {
  name: string;
  client: GrafanaClient;
}

interface InstanceConfig {
  name: string;
  url: string;
  service_account_token?: string;
  api_key?: string;
  cloud_access_policy_token?: string;
  username?: string;
  password?: string;
  org_id?: number;
  tls_skip_verify?: boolean;
}

export class ClientRegistry {
  private instances = new Map<string, InstanceContext>();
  private defaultName: string;

  constructor(defaultName: string) {
    this.defaultName = defaultName;
  }

  add(name: string, client: GrafanaClient): void {
    this.instances.set(name, { name, client });
  }

  resolve(name?: string): InstanceContext {
    const key = name ?? this.defaultName;
    const ctx = this.instances.get(key);
    if (!ctx) {
      const available = Array.from(this.instances.keys()).join(", ");
      throw new Error(
        `Unknown Grafana instance: "${key}". Available instances: ${available}`
      );
    }
    return ctx;
  }

  names(): string[] {
    return Array.from(this.instances.keys());
  }
}

function resolveAuth(cfg: {
  service_account_token?: string;
  api_key?: string;
  cloud_access_policy_token?: string;
  username?: string;
  password?: string;
}): AuthConfig {
  if (cfg.service_account_token) {
    return { mode: "bearer", token: cfg.service_account_token, tokenKind: "service_account" };
  }
  if (cfg.cloud_access_policy_token) {
    return { mode: "bearer", token: cfg.cloud_access_policy_token, tokenKind: "cloud_access_policy" };
  }
  if (cfg.api_key) {
    return { mode: "bearer", token: cfg.api_key, tokenKind: "api_key" };
  }
  if (cfg.username && cfg.password) {
    return { mode: "basic", username: cfg.username, password: cfg.password };
  }
  throw new Error(
    "No Grafana credentials provided. Set one of: GRAFANA_SERVICE_ACCOUNT_TOKEN, GRAFANA_CLOUD_ACCESS_POLICY_TOKEN, GRAFANA_API_KEY, or GRAFANA_USERNAME + GRAFANA_PASSWORD."
  );
}

export function buildRegistryFromEnv(): ClientRegistry {
  const raw = process.env.GRAFANA_INSTANCES;
  if (raw) {
    const parsed = JSON.parse(raw) as InstanceConfig[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("GRAFANA_INSTANCES must be a non-empty array.");
    }
    const registry = new ClientRegistry(parsed[0].name);
    for (const cfg of parsed) {
      if (!cfg.name || !cfg.url) {
        throw new Error(
          `Each GRAFANA_INSTANCES entry requires name and url: ${JSON.stringify(cfg)}`
        );
      }
      const auth = resolveAuth(cfg);
      registry.add(
        cfg.name,
        new GrafanaClient(cfg.url, auth, {
          orgId: cfg.org_id,
          tlsSkipVerify: cfg.tls_skip_verify,
        })
      );
    }
    return registry;
  }

  const url = process.env.GRAFANA_URL;
  if (!url) {
    throw new Error(
      "GRAFANA_URL is required (or set GRAFANA_INSTANCES for multi-instance mode)."
    );
  }

  const auth = resolveAuth({
    service_account_token: process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN,
    cloud_access_policy_token: process.env.GRAFANA_CLOUD_ACCESS_POLICY_TOKEN,
    api_key: process.env.GRAFANA_API_KEY,
    username: process.env.GRAFANA_USERNAME,
    password: process.env.GRAFANA_PASSWORD,
  });

  const orgIdRaw = process.env.GRAFANA_ORG_ID;
  const orgId = orgIdRaw ? Number(orgIdRaw) : undefined;
  const tlsSkipVerify =
    process.env.GRAFANA_TLS_SKIP_VERIFY === "true" ||
    process.env.GRAFANA_TLS_SKIP_VERIFY === "1";

  const registry = new ClientRegistry("default");
  registry.add(
    "default",
    new GrafanaClient(url, auth, { orgId, tlsSkipVerify })
  );
  return registry;
}
