import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEFAULT_PATH = path.join(os.homedir(), ".grafana-mcp", "audit.log");

export class AuditLog {
  private enabled: boolean;
  private filePath: string;

  constructor() {
    const envPath = process.env.GRAFANA_MCP_AUDIT_LOG;
    if (envPath === "off" || envPath === "false") {
      this.enabled = false;
      this.filePath = "";
      return;
    }
    this.enabled = true;
    this.filePath = envPath && envPath.length > 0 ? envPath : DEFAULT_PATH;
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  record(entry: {
    tool: string;
    args?: Record<string, unknown>;
    durationMs?: number;
    status: "ok" | "error";
    error?: string;
  }): void {
    if (!this.enabled) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
    });
    try {
      fs.appendFileSync(this.filePath, line + "\n", "utf-8");
    } catch {
      // swallow — audit failures must not break tool execution
    }
  }

  getPath(): string | null {
    return this.enabled ? this.filePath : null;
  }
}
