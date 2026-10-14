import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AuthConfig } from "@/interfaces/grafana-client.js";
export type {
  InstanceConfig,
  InstanceSource,
  LoadedInstance,
  LoadedInstances,
} from "@/interfaces/instance-config.js";
import type {
  InstanceConfig,
  InstanceSource,
  InstancesFileSource,
  LoadedInstance,
  LoadedInstances,
} from "@/interfaces/instance-config.js";
import { logger } from "@/logger.js";

const DEFAULT_INSTANCES_FILE = path.join(os.homedir(), ".grafana-mcp", "instances.json");
const CREDENTIAL_FIELDS = [
  "service_account_token",
  "cloud_access_policy_token",
  "api_key",
  "username",
  "password",
] as const;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveInstancesFilePath(): string {
  const raw = process.env.GRAFANA_INSTANCES_FILE;
  if (!raw) return DEFAULT_INSTANCES_FILE;
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/")) return path.join(os.homedir(), raw.slice(2));
  return path.resolve(raw);
}

export function getFileMtime(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function resolveAuth(cfg: InstanceConfig): AuthConfig | null {
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
  return null;
}

function credentialHint(source: InstanceSource): string {
  if (source === "GRAFANA_URL") {
    return "Set one of: GRAFANA_SERVICE_ACCOUNT_TOKEN, GRAFANA_CLOUD_ACCESS_POLICY_TOKEN, GRAFANA_API_KEY, or GRAFANA_USERNAME + GRAFANA_PASSWORD.";
  }
  return "Set one of: service_account_token, cloud_access_policy_token, api_key, or username + password.";
}

function parseOrgId(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${label}: org_id must be a positive integer (got ${JSON.stringify(value)}).`);
  }
  return n;
}

function normalizeEntry(raw: unknown, source: InstanceSource, where: string): LoadedInstance {
  if (!isRecord(raw)) throw new Error(`${where}: each instance must be an object.`);
  const cfg = raw as unknown as InstanceConfig;

  if (typeof cfg.url !== "string" || !cfg.url) throw new Error(`${where}: "url" is required.`);
  let hostname: string;
  try {
    hostname = new URL(cfg.url).hostname;
  } catch {
    throw new Error(`${where}: invalid url ${JSON.stringify(cfg.url)}.`);
  }

  if (cfg.name !== undefined && typeof cfg.name !== "string") {
    throw new Error(`${where}: "name" must be a string.`);
  }
  const name = cfg.name?.trim() || hostname;
  const label = `Instance "${name}" (${where})`;

  for (const field of CREDENTIAL_FIELDS) {
    if (cfg[field] !== undefined && typeof cfg[field] !== "string") {
      throw new Error(`${label}: "${field}" must be a string.`);
    }
  }
  const auth = resolveAuth(cfg);
  if (!auth) throw new Error(`${label}: no credentials. ${credentialHint(source)}`);

  return {
    name,
    source,
    url: cfg.url,
    auth,
    orgId: parseOrgId(cfg.org_id, label),
    tlsSkipVerify: cfg.tls_skip_verify === true,
  };
}

function readFileSource(filePath: string): InstancesFileSource | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`Cannot access instances file ${filePath}: ${errorMessage(err)}`);
  }

  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    logger.warn(
      `${filePath} is readable by other users but stores credentials. Restrict it with: chmod 600 ${filePath}`
    );
  }

  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(`Cannot read instances file ${filePath}: ${errorMessage(err)}`);
  }
  if (!text.trim()) return { entries: [], mtimeMs: stat.mtimeMs };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Instances file ${filePath} is not valid JSON: ${errorMessage(err)}`);
  }

  if (Array.isArray(parsed)) return { entries: parsed, mtimeMs: stat.mtimeMs };
  if (!isRecord(parsed) || !Array.isArray(parsed.instances)) {
    throw new Error(
      `Instances file ${filePath} must be {"default"?: string, "instances": [...]} or an array of instances.`
    );
  }
  if (parsed.default !== undefined && typeof parsed.default !== "string") {
    throw new Error(`Instances file ${filePath}: "default" must be a string.`);
  }
  return { entries: parsed.instances, defaultName: parsed.default, mtimeMs: stat.mtimeMs };
}

function readEnvJsonSource(): unknown[] {
  const raw = process.env.GRAFANA_INSTANCES;
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`GRAFANA_INSTANCES is not valid JSON: ${errorMessage(err)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("GRAFANA_INSTANCES must be a JSON array of instances.");
  }
  return parsed;
}

function readEnvSingleSource(): InstanceConfig | null {
  const url = process.env.GRAFANA_URL;
  if (!url) return null;
  const tls = process.env.GRAFANA_TLS_SKIP_VERIFY;
  return {
    name: "default",
    url,
    service_account_token: process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN,
    cloud_access_policy_token: process.env.GRAFANA_CLOUD_ACCESS_POLICY_TOKEN,
    api_key: process.env.GRAFANA_API_KEY,
    username: process.env.GRAFANA_USERNAME,
    password: process.env.GRAFANA_PASSWORD,
    org_id: process.env.GRAFANA_ORG_ID,
    tls_skip_verify: tls === "true" || tls === "1",
  };
}

function noInstanceGuide(filePath: string): string {
  return [
    "No Grafana instance configured. Register at least one in any of these ways:",
    `  1. Instances file (${filePath}, override with GRAFANA_INSTANCES_FILE):`,
    '     {"default": "dev", "instances": [{"name": "dev", "url": "https://grafana.example.com", "service_account_token": "glsa_xxx"}]}',
    "  2. GRAFANA_INSTANCES env: a JSON array of the same instance objects.",
    "  3. GRAFANA_URL env + one of GRAFANA_SERVICE_ACCOUNT_TOKEN / GRAFANA_CLOUD_ACCESS_POLICY_TOKEN / GRAFANA_API_KEY / GRAFANA_USERNAME + GRAFANA_PASSWORD.",
  ].join("\n");
}

function assertUniqueNames(instances: LoadedInstance[]): void {
  const seen = new Map<string, LoadedInstance>();
  for (const inst of instances) {
    const key = inst.name.toLowerCase();
    const prev = seen.get(key);
    if (prev) {
      throw new Error(
        `Duplicate instance name "${inst.name}" (from ${prev.source} and ${inst.source}). Names must be unique (case-insensitive) — set "name" explicitly to tell them apart.`
      );
    }
    seen.set(key, inst);
  }
}

function resolveDefaultName(
  instances: LoadedInstance[],
  requested: string | undefined,
  filePath: string
): string {
  if (!requested) return instances[0].name;
  const match = instances.find((i) => i.name.toLowerCase() === requested.trim().toLowerCase());
  if (!match) {
    const available = instances.map((i) => i.name).join(", ");
    throw new Error(
      `"default": "${requested}" in ${filePath} does not match any registered instance. Available: ${available}`
    );
  }
  return match.name;
}

export function loadInstances(): LoadedInstances {
  const filePath = resolveInstancesFilePath();
  const file = readFileSource(filePath);
  const envSingle = readEnvSingleSource();

  const instances: LoadedInstance[] = [
    ...(file?.entries ?? []).map((raw, i) => normalizeEntry(raw, "file", `${filePath} entry #${i + 1}`)),
    ...readEnvJsonSource().map((raw, i) =>
      normalizeEntry(raw, "GRAFANA_INSTANCES", `GRAFANA_INSTANCES entry #${i + 1}`)
    ),
    ...(envSingle ? [normalizeEntry(envSingle, "GRAFANA_URL", "GRAFANA_URL")] : []),
  ];

  if (instances.length === 0) throw new Error(noInstanceGuide(filePath));
  assertUniqueNames(instances);

  return {
    instances,
    defaultName: resolveDefaultName(instances, file?.defaultName, filePath),
    filePath,
    fileMtimeMs: file?.mtimeMs ?? null,
  };
}
