/**
 * coralpulse observations: a simple append-only JSONL store.
 * One line per observation. Easy to sync, back up, or process by hand.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isIsoDate } from "./util.js";

export interface Observation {
  id: string;
  siteId: string;
  date: string;
  score: number | null;
  bleachedPercent: number | null;
  depthM: number | null;
  latitude: number | null;
  longitude: number | null;
  photo: string | null;
  notes: string;
  createdAt: string;
}

export interface ObservationInput {
  siteId: string;
  date: string;
  score?: number | null;
  bleachedPercent?: number | null;
  depthM?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  photo?: string | null;
  notes?: string;
  /** Overrides for tests and imports. */
  id?: string;
  createdAt?: string;
}

export function observationsPath(dataDir: string): string {
  return join(dataDir, "observations.jsonl");
}

export function loadObservations(dataDir: string): Observation[] {
  const path = observationsPath(dataDir);
  if (!existsSync(path)) {
    return [];
  }
  const text = readFileSync(path, "utf8");
  const list: Observation[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }
    try {
      const data: unknown = JSON.parse(line);
      if (typeof data === "object" && data !== null && typeof (data as Observation).id === "string") {
        list.push(data as Observation);
      }
    } catch {
      // Skip corrupt lines. The raw file keeps them for manual repair.
    }
  }
  return list;
}

export function makeObservationId(siteId: string, date: string, existing: Observation[]): string {
  const seq = existing.filter((o) => o.siteId === siteId && o.date === date).length + 1;
  return `obs-${siteId}-${date.replaceAll("-", "")}-${seq}`;
}

export function addObservation(dataDir: string, input: ObservationInput): Observation {
  const existing = loadObservations(dataDir);
  const observation: Observation = {
    id: input.id ?? makeObservationId(input.siteId, input.date, existing),
    siteId: input.siteId,
    date: input.date,
    score: input.score ?? null,
    bleachedPercent: input.bleachedPercent ?? null,
    depthM: input.depthM ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    photo: input.photo ?? null,
    notes: input.notes ?? "",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  const path = observationsPath(dataDir);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(observation)}\n`);
  return observation;
}

export function validateObservationInput(input: ObservationInput): string[] {
  const problems: string[] = [];
  if (typeof input.siteId !== "string" || input.siteId.length === 0) {
    problems.push("siteId must be a non-empty string");
  }
  if (typeof input.date !== "string" || !isIsoDate(input.date)) {
    problems.push("date must be YYYY-MM-DD");
  }
  const score = input.score;
  if (score !== undefined && score !== null) {
    if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 6) {
      problems.push("score must be an integer between 1 and 6 (CoralWatch colour score)");
    }
  }
  const percent = input.bleachedPercent;
  if (percent !== undefined && percent !== null) {
    if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      problems.push("bleachedPercent must be a number between 0 and 100");
    }
  }
  if (
    (input.score === undefined || input.score === null) &&
    (input.bleachedPercent === undefined || input.bleachedPercent === null)
  ) {
    problems.push("provide score or bleachedPercent (at least one)");
  }
  const depth = input.depthM;
  if (depth !== undefined && depth !== null) {
    if (typeof depth !== "number" || !Number.isFinite(depth) || depth < 0) {
      problems.push("depthM must be a number of metres, zero or more");
    }
  }
  const lat = input.latitude;
  if (lat !== undefined && lat !== null) {
    if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      problems.push("latitude must be between -90 and 90");
    }
  }
  const lon = input.longitude;
  if (lon !== undefined && lon !== null) {
    if (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      problems.push("longitude must be between -180 and 180");
    }
  }
  return problems;
}

export function summarizeObservations(observations: Observation[]): { total: number; bySite: Record<string, number> } {
  const bySite: Record<string, number> = {};
  for (const observation of observations) {
    bySite[observation.siteId] = (bySite[observation.siteId] ?? 0) + 1;
  }
  return { total: observations.length, bySite };
}