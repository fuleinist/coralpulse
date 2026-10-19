/**
 * coralpulse config: types, defaults, loading, and validation.
 */
import { readFileSync } from "node:fs";

export interface SiteConfig {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Alert at or above this level (0-5). Default: 3 (Alert Level 1). */
  minAlertLevel?: number;
}

export interface NotifyConfig {
  server?: string;
  topic?: string;
}

export interface RiskConfig {
  /** Hours before cached data counts as stale. Default: 12. */
  cacheHours?: number;
}

export interface CoralpulseConfig {
  version: 1;
  dataDir: string;
  sites: SiteConfig[];
  notify?: NotifyConfig;
  risk?: RiskConfig;
}

export class ConfigError extends Error {}

export const DEFAULT_MIN_ALERT_LEVEL = 3;
export const DEFAULT_CACHE_HOURS = 12;

export function defaultConfig(): CoralpulseConfig {
  return {
    version: 1,
    dataDir: "data",
    sites: [
      {
        id: "davies-reef",
        name: "Davies Reef, Great Barrier Reef",
        latitude: -18.2871,
        longitude: 147.6992,
        minAlertLevel: DEFAULT_MIN_ALERT_LEVEL,
      },
    ],
    notify: { server: "https://ntfy.sh", topic: "" },
    risk: { cacheHours: DEFAULT_CACHE_HOURS },
  };
}

export function loadConfigFile(path: string): CoralpulseConfig {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new ConfigError(`cannot read config file: ${path}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ConfigError(`config file is not valid JSON: ${path}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ConfigError("config must be a JSON object");
  }
  return data as CoralpulseConfig;
}

export function collectConfigIssues(config: CoralpulseConfig): string[] {
  const issues: string[] = [];
  if (config.version !== 1) {
    issues.push("version must be 1");
  }
  if (typeof config.dataDir !== "string" || config.dataDir.length === 0) {
    issues.push("dataDir must be a non-empty string");
  }
  if (config.notify !== undefined) {
    if (typeof config.notify !== "object" || config.notify === null) {
      issues.push("notify must be an object");
    } else {
      if (config.notify.server !== undefined && typeof config.notify.server !== "string") {
        issues.push("notify.server must be a string");
      }
      if (config.notify.topic !== undefined && typeof config.notify.topic !== "string") {
        issues.push("notify.topic must be a string");
      }
    }
  }
  if (!Array.isArray(config.sites) || config.sites.length === 0) {
    issues.push("sites must be a non-empty array");
    return issues;
  }
  const seen = new Set<string>();
  for (const [index, rawSite] of config.sites.entries()) {
    const label = `sites[${index}]`;
    if (typeof rawSite !== "object" || rawSite === null) {
      issues.push(`${label} must be an object`);
      continue;
    }
    const site = rawSite as SiteConfig;
    if (typeof site.id !== "string" || site.id.length === 0) {
      issues.push(`${label}.id must be a non-empty string`);
    } else if (seen.has(site.id)) {
      issues.push(`${label}.id is a duplicate: ${site.id}`);
    } else {
      seen.add(site.id);
    }
    if (typeof site.name !== "string" || site.name.length === 0) {
      issues.push(`${label}.name must be a non-empty string`);
    }
    const lat = site.latitude;
    if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      issues.push(`${label}.latitude must be a number between -90 and 90`);
    }
    const lon = site.longitude;
    if (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      issues.push(`${label}.longitude must be a number between -180 and 180`);
    }
    if (site.minAlertLevel !== undefined) {
      const level = site.minAlertLevel;
      if (typeof level !== "number" || !Number.isInteger(level) || level < 0 || level > 5) {
        issues.push(`${label}.minAlertLevel must be an integer between 0 and 5`);
      }
    }
  }
  if (config.risk !== undefined) {
    if (typeof config.risk !== "object" || config.risk === null) {
      issues.push("risk must be an object");
    } else if (config.risk.cacheHours !== undefined) {
      const hours = config.risk.cacheHours;
      if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) {
        issues.push("risk.cacheHours must be a positive number");
      }
    }
  }
  return issues;
}

export function collectConfigWarnings(config: CoralpulseConfig): string[] {
  const warnings: string[] = [];
  if (Array.isArray(config.sites)) {
    for (const [index, rawSite] of config.sites.entries()) {
      if (typeof rawSite !== "object" || rawSite === null) {
        continue;
      }
      const site = rawSite as SiteConfig;
      if (typeof site.id !== "string" || site.id.length === 0) {
        continue;
      }
      if (site.id !== site.id.trim()) {
        warnings.push(`sites[${index}].id has leading or trailing spaces`);
      }
      if (/[A-Z]/.test(site.id)) {
        warnings.push(`sites[${index}].id "${site.id}" is not lowercase; slugs are easier to type`);
      }
    }
  }
  if (config.notify && !config.notify.topic) {
    warnings.push("notify.topic is empty; the notify command cannot send messages");
  }
  return warnings;
}