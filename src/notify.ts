/**
 * coralpulse notifications via ntfy (https://ntfy.sh).
 */
import type { RiskEntry } from "./report.js";

export const DEFAULT_NTFY_SERVER = "https://ntfy.sh";

export interface AlertMessage {
  title: string;
  message: string;
}

export function buildAlert(entries: RiskEntry[]): AlertMessage | null {
  if (entries.length === 0) {
    return null;
  }
  const count = entries.length;
  const title = `coralpulse: bleaching alert for ${count} site${count === 1 ? "" : "s"}`;
  const lines = entries.map((entry) => {
    const a = entry.assessment;
    const dhw = a.metrics.dhw === null ? "n/a" : a.metrics.dhw.toFixed(1);
    const hotspot = a.metrics.hotspot === null ? "n/a" : a.metrics.hotspot.toFixed(1);
    const data = a.dataTime ?? "unknown";
    return `${entry.name}: ${a.label} (DHW ${dhw} °C-weeks, HotSpot ${hotspot} °C, data ${data})`;
  });
  return { title, message: lines.join("\n") };
}

export interface NtfySendOptions {
  server?: string;
  topic: string;
  title: string;
  message: string;
  priority?: "min" | "low" | "default" | "high" | "urgent";
}

export function effectiveServer(server?: string): string {
  const trimmed = (server && server.length > 0 ? server : DEFAULT_NTFY_SERVER).replace(/\/+$/, "");
  return trimmed;
}

export async function sendNtfy(
  options: NtfySendOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = `${effectiveServer(options.server)}/${options.topic}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Title: options.title,
      Priority: options.priority ?? "default",
    },
    body: options.message,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`ntfy POST failed: HTTP ${res.status}`);
  }
}