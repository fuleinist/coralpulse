/**
 * coralpulse CSV exports for reef databases.
 *
 * Column sets are documented and stable. Check the current upload templates
 * of CoralWatch and MERMAID before you send a file.
 */
import type { Observation } from "./observations.js";

export type ExportFormat = "generic" | "coralwatch" | "mermaid";

export const EXPORT_FORMATS: readonly ExportFormat[] = ["generic", "coralwatch", "mermaid"];

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function num(value: number | null): string {
  return value === null ? "" : String(value);
}

function toCsv(header: string[], rows: string[][]): string {
  const lines = [header.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function sorted(observations: Observation[]): Observation[] {
  return [...observations].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
}

export function observationsToCsv(observations: Observation[], format: ExportFormat): string {
  const rows = sorted(observations);
  if (format === "generic") {
    return toCsv(
      [
        "id",
        "site_id",
        "date",
        "score",
        "bleached_percent",
        "depth_m",
        "latitude",
        "longitude",
        "photo",
        "notes",
        "created_at",
      ],
      rows.map((o) => [
        o.id,
        o.siteId,
        o.date,
        num(o.score),
        num(o.bleachedPercent),
        num(o.depthM),
        num(o.latitude),
        num(o.longitude),
        o.photo ?? "",
        o.notes,
        o.createdAt,
      ]),
    );
  }
  if (format === "coralwatch") {
    return toCsv(
      ["date", "site", "latitude", "longitude", "depth_m", "colour_score", "bleached_percent", "notes"],
      rows.map((o) => [
        o.date,
        o.siteId,
        num(o.latitude),
        num(o.longitude),
        num(o.depthM),
        num(o.score),
        num(o.bleachedPercent),
        o.notes,
      ]),
    );
  }
  return toCsv(
    ["site_id", "date", "latitude", "longitude", "depth_m", "bleached_percent", "notes"],
    rows.map((o) => [
      o.siteId,
      o.date,
      num(o.latitude),
      num(o.longitude),
      num(o.depthM),
      num(o.bleachedPercent),
      o.notes,
    ]),
  );
}