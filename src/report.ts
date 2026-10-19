/**
 * coralpulse report rendering: text and JSON output for risk assessments.
 */
import type { RiskAssessment } from "./risk.js";

export interface RiskEntry {
  siteId: string;
  name: string;
  assessment: RiskAssessment;
}

export function formatValue(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(digits);
}

export function formatAgeDays(dataTime: string | null, now: Date = new Date()): string {
  if (!dataTime) {
    return "no data date";
  }
  const t = Date.parse(dataTime);
  if (Number.isNaN(t)) {
    return "unknown date";
  }
  const days = (now.getTime() - t) / 86_400_000;
  if (days < 1) {
    return "less than a day old";
  }
  const rounded = Math.round(days);
  return `${rounded} day${rounded === 1 ? "" : "s"} old`;
}

export function formatRiskText(entries: RiskEntry[], now: Date = new Date()): string {
  const lines: string[] = [];
  lines.push(
    `coralpulse risk report — ${entries.length} site${entries.length === 1 ? "" : "s"} — ${now.toISOString()}`,
  );
  lines.push("");
  for (const entry of entries) {
    const a = entry.assessment;
    lines.push(`${entry.name} (${entry.siteId})`);
    const levelSuffix = a.level === null ? "" : ` (${a.level})`;
    const estimated = a.derived ? " [estimated]" : "";
    lines.push(`  Level: ${a.label}${levelSuffix}${estimated}`);
    lines.push(`  ${a.summary}`);
    if (a.dataTime === null) {
      lines.push("  Data date: unknown");
    } else {
      lines.push(`  Data date: ${a.dataTime} (${formatAgeDays(a.dataTime, now)})`);
    }
    lines.push(
      `  Values: SST ${formatValue(a.metrics.sst)} °C · Anomaly ${formatValue(a.metrics.ssta)} °C · HotSpot ${formatValue(a.metrics.hotspot)} °C · DHW ${formatValue(a.metrics.dhw)} °C-weeks · BAA ${a.metrics.baaByte === null ? "—" : a.metrics.baaByte}`,
    );
    if (a.actions.length > 0) {
      lines.push("  Next actions:");
      for (const action of a.actions) {
        lines.push(`   - ${action}`);
      }
    }
    for (const note of a.notes) {
      lines.push(`  Note: ${note}`);
    }
    lines.push("");
  }
  lines.push("Source: NOAA Coral Reef Watch 5 km daily products via CoastWatch ERDDAP.");
  lines.push("Satellite data lags about one to four days. Treat levels as guidance, not proof.");
  return lines.join("\n");
}

export function formatRiskJson(entries: RiskEntry[], now: Date = new Date()): string {
  return JSON.stringify(
    {
      tool: "coralpulse",
      generatedAt: now.toISOString(),
      sites: entries.map((entry) => ({ name: entry.name, ...entry.assessment })),
    },
    null,
    2,
  );
}