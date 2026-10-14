import { GrafanaClient } from "@/grafana-client.js";
import { suggestClosest } from "@/fuzzy-match.js";
import { getFileMtime, loadInstances } from "@/instance-config.js";
export type { ActiveSwitch, InstanceContext } from "@/interfaces/client-registry.js";
import type {
  ActiveSwitch,
  InstanceContext,
  RegistryState,
} from "@/interfaces/client-registry.js";
import type { LoadedInstances } from "@/interfaces/instance-config.js";
import { logger } from "@/logger.js";

function buildState(loaded: LoadedInstances): RegistryState {
  const instances = new Map<string, InstanceContext>();
  for (const inst of loaded.instances) {
    instances.set(inst.name.toLowerCase(), {
      name: inst.name,
      source: inst.source,
      orgId: inst.orgId,
      tlsSkipVerify: inst.tlsSkipVerify,
      client: new GrafanaClient(inst.url, inst.auth, {
        orgId: inst.orgId,
        tlsSkipVerify: inst.tlsSkipVerify,
      }),
    });
  }
  return {
    instances,
    defaultKey: loaded.defaultName.toLowerCase(),
    filePath: loaded.filePath,
    fileMtimeMs: loaded.fileMtimeMs,
  };
}

export class ClientRegistry {
  private state: RegistryState;
  private activeKey: string | null = null;

  constructor(loaded: LoadedInstances) {
    this.state = buildState(loaded);
    this.warnIfTlsSkipShared();
  }

  resolve(name?: string): InstanceContext {
    if (name === undefined) return this.getActive();
    return this.lookup(name);
  }

  setActive(name: string): ActiveSwitch {
    const previous = this.getActive();
    const current = this.lookup(name);
    this.activeKey = current.name.toLowerCase();
    return { previous, current };
  }

  getActive(): InstanceContext {
    const active = this.activeKey ? this.state.instances.get(this.activeKey) : undefined;
    return active ?? this.getDefault();
  }

  getDefault(): InstanceContext {
    const ctx = this.state.instances.get(this.state.defaultKey);
    if (!ctx) throw new Error(`Default instance "${this.state.defaultKey}" is not registered.`);
    return ctx;
  }

  list(): InstanceContext[] {
    return Array.from(this.state.instances.values());
  }

  names(): string[] {
    return this.list().map((ctx) => ctx.name);
  }

  getFilePath(): string {
    return this.state.filePath;
  }

  getTlsWarning(): string | null {
    const skipped = this.list().filter((ctx) => ctx.tlsSkipVerify);
    if (skipped.length === 0 || this.state.instances.size < 2) return null;
    const names = skipped.map((ctx) => ctx.name).join(", ");
    return `tls_skip_verify is enabled for ${names}. It disables TLS verification process-wide, so it also applies to every other instance.`;
  }

  reloadIfChanged(): string[] {
    const mtime = getFileMtime(this.state.filePath);
    if (mtime === this.state.fileMtimeMs) return [];

    let loaded: LoadedInstances;
    try {
      loaded = loadInstances();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`instances reload failed, keeping previous list: ${msg}`);
      return [`Warning: failed to reload ${this.state.filePath}; keeping the previous instance list. ${msg}`];
    }

    const previousActive = this.activeKey ? this.state.instances.get(this.activeKey) : undefined;
    this.state = buildState(loaded);
    this.warnIfTlsSkipShared();

    const notices = [`Reloaded instances from ${this.state.filePath}: ${this.names().join(", ")}.`];
    if (this.activeKey && !this.state.instances.has(this.activeKey)) {
      notices.push(
        `Active instance "${previousActive?.name ?? this.activeKey}" is no longer registered; switched back to default "${this.getDefault().name}".`
      );
      this.activeKey = null;
    }
    logger.info(notices.join(" "));
    return notices;
  }

  private lookup(name: string): InstanceContext {
    const ctx = this.state.instances.get(name.trim().toLowerCase());
    if (ctx) return ctx;
    const names = this.names();
    const suggestions = suggestClosest(name, names, 3);
    const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
    throw new Error(
      `Unknown Grafana instance: "${name}".${hint} Available instances: ${names.join(", ")}. Use list_instances for details.`
    );
  }

  private warnIfTlsSkipShared(): void {
    const warning = this.getTlsWarning();
    if (warning) logger.warn(warning);
  }
}
