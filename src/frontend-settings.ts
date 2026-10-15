import type {
  FrontendSettings,
  FrontendSettingsDataSource,
  GrafanaDataSource,
} from "@/interfaces/grafana-client.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toDataSource(ds: FrontendSettingsDataSource): GrafanaDataSource | null {
  if (ds.meta?.builtIn) return null;
  if (typeof ds.uid !== "string" || typeof ds.type !== "string" || typeof ds.name !== "string") {
    return null;
  }
  return {
    id: typeof ds.id === "number" && ds.id > 0 ? ds.id : undefined,
    uid: ds.uid,
    name: ds.name,
    type: ds.type,
    url: ds.url,
    access: ds.access,
    isDefault: ds.isDefault ?? false,
  };
}

export function dataSourcesFromFrontendSettings(settings: unknown): GrafanaDataSource[] {
  if (!isRecord(settings) || !isRecord(settings.datasources)) {
    throw new Error("Unexpected /api/frontend/settings response: no `datasources` map.");
  }
  const entries = Object.values((settings as FrontendSettings).datasources ?? {});
  const out: GrafanaDataSource[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const ds = toDataSource(entry as FrontendSettingsDataSource);
    if (ds) out.push(ds);
  }
  return out;
}
