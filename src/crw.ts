/**
 * NOAA Coral Reef Watch client.
 *
 * Reads the 5 km daily products from the CoastWatch ERDDAP service.
 * Base service: https://coastwatch.noaa.gov/erddap (verified 2026-10-20).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CRW_BASE_URL = "https://coastwatch.noaa.gov/erddap";

export type ProductKey = "sst" | "ssta" | "hotspot" | "dhw" | "baa";

export interface ProductSpec {
  key: ProductKey;
  datasetId: string;
  variable: string;
  label: string;
  unit: string;
}

export const CRW_PRODUCTS: readonly ProductSpec[] = [
  {
    key: "sst",
    datasetId: "noaacrwsstDaily",
    variable: "analysed_sst",
    label: "Sea surface temperature",
    unit: "°C",
  },
  {
    key: "ssta",
    datasetId: "noaacrwsstanomalyDaily",
    variable: "sea_surface_temperature_anomaly",
    label: "SST anomaly",
    unit: "°C",
  },
  {
    key: "hotspot",
    datasetId: "noaacrwhotspotDaily",
    variable: "hotspot",
    label: "HotSpot",
    unit: "°C",
  },
  {
    key: "dhw",
    datasetId: "noaacrwdhwDaily",
    variable: "degree_heating_week",
    label: "Degree heating weeks",
    unit: "°C-weeks",
  },
  {
    key: "baa",
    datasetId: "noaacrwbaa7dDaily",
    variable: "bleaching_alert_area",
    label: "Bleaching alert area",
    unit: "",
  },
];

export interface CrwValue {
  key: ProductKey;
  time: string;
  latitude: number;
  longitude: number;
  /** NaN means the value is masked or missing at this grid cell. */
  value: number;
}

export interface SiteSnapshot {
  siteId: string;
  fetchedAt: string;
  values: Partial<Record<ProductKey, CrwValue>>;
  errors: Partial<Record<ProductKey, string>>;
}

export function buildPointQueryUrl(
  spec: ProductSpec,
  latitude: number,
  longitude: number,
  base: string = CRW_BASE_URL,
): string {
  const raw = `${base}/griddap/${spec.datasetId}.csv?${spec.variable}[(last)][(${latitude})][(${longitude})]`;
  return raw
    .replaceAll("[", "%5B")
    .replaceAll("]", "%5D")
    .replaceAll("(", "%28")
    .replaceAll(")", "%29");
}

export interface ParsedPointRow {
  time: string;
  latitude: number;
  longitude: number;
  value: number;
}

/**
 * Parse an ERDDAP griddap CSV payload for a single point.
 * The payload has two header rows: column names and units.
 */
export function parseSinglePointCsv(text: string): ParsedPointRow {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 3) {
    throw new Error(`unexpected CSV payload (${lines.length} line(s))`);
  }
  const row = lines[2].split(",");
  if (row.length < 4) {
    throw new Error(`unexpected CSV row: ${lines[2]}`);
  }
  return {
    time: row[0].trim(),
    latitude: Number.parseFloat(row[1]),
    longitude: Number.parseFloat(row[2]),
    value: Number.parseFloat(row[3]),
  };
}

export async function fetchPoint(
  spec: ProductSpec,
  latitude: number,
  longitude: number,
  fetchImpl: typeof fetch = fetch,
): Promise<CrwValue> {
  const url = buildPointQueryUrl(spec, latitude, longitude);
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${spec.datasetId}`);
  }
  const text = await res.text();
  const row = parseSinglePointCsv(text);
  return {
    key: spec.key,
    time: row.time,
    latitude: row.latitude,
    longitude: row.longitude,
    value: row.value,
  };
}

export interface SiteLike {
  id: string;
  latitude: number;
  longitude: number;
}

export async function fetchSiteSnapshot(
  site: SiteLike,
  fetchImpl: typeof fetch = fetch,
): Promise<SiteSnapshot> {
  const snapshot: SiteSnapshot = {
    siteId: site.id,
    fetchedAt: new Date().toISOString(),
    values: {},
    errors: {},
  };
  const results = await Promise.allSettled(
    CRW_PRODUCTS.map((spec) => fetchPoint(spec, site.latitude, site.longitude, fetchImpl)),
  );
  results.forEach((result, index) => {
    const spec = CRW_PRODUCTS[index];
    if (result.status === "fulfilled") {
      snapshot.values[spec.key] = result.value;
    } else {
      snapshot.errors[spec.key] =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
    }
  });
  return snapshot;
}

export function snapshotPath(dataDir: string, siteId: string): string {
  return join(dataDir, "cache", `${siteId}.json`);
}

export function saveSnapshot(snapshot: SiteSnapshot, dataDir: string): string {
  const path = snapshotPath(dataDir, snapshot.siteId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
  return path;
}

export function loadSnapshot(siteId: string, dataDir: string): SiteSnapshot | null {
  const path = snapshotPath(dataDir, siteId);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      typeof data !== "object" ||
      data === null ||
      typeof (data as SiteSnapshot).siteId !== "string" ||
      typeof (data as SiteSnapshot).fetchedAt !== "string"
    ) {
      return null;
    }
    return data as SiteSnapshot;
  } catch {
    return null;
  }
}

export function ageInHours(fetchedAt: string, now: Date = new Date()): number {
  const t = Date.parse(fetchedAt);
  if (Number.isNaN(t)) {
    return Number.POSITIVE_INFINITY;
  }
  return (now.getTime() - t) / 3_600_000;
}

export function isSnapshotFresh(
  snapshot: SiteSnapshot,
  cacheHours: number,
  now: Date = new Date(),
): boolean {
  return ageInHours(snapshot.fetchedAt, now) <= cacheHours;
}

export function snapshotDataTime(snapshot: SiteSnapshot): string | null {
  let latest: string | null = null;
  for (const value of Object.values(snapshot.values)) {
    if (value && typeof value.time === "string" && value.time.length > 0) {
      if (latest === null || value.time > latest) {
        latest = value.time;
      }
    }
  }
  return latest;
}