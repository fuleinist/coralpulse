/**
 * coralpulse risk model: alert levels, assessments, and plain-language guidance.
 *
 * The primary signal is the NOAA CRW "bleaching_alert_area" byte:
 * 0 No Stress, 1 Watch, 2 Warning, 3 Alert Level 1, 4 Alert Level 2.
 * Higher bytes are shown as Alert Level 3+ (the scale is clamped at 5).
 */
import type { ProductKey, SiteSnapshot } from "./crw.js";
import { snapshotDataTime } from "./crw.js";
import { clamp } from "./util.js";

export type RiskTone = "ok" | "watch" | "warning" | "alert" | "unknown";

export interface LevelInfo {
  label: string;
  tone: RiskTone;
  summary: string;
  actions: string[];
}

export interface AlertLevelInfo extends LevelInfo {
  level: number;
}

export const ALERT_LEVELS: readonly AlertLevelInfo[] = [
  {
    level: 0,
    label: "No Stress",
    tone: "ok",
    summary: "No heat stress. Conditions are normal for this reef.",
    actions: [
      "Keep observing on your normal schedule.",
      "Log observations to build a local baseline.",
    ],
  },
  {
    level: 1,
    label: "Watch",
    tone: "watch",
    summary: "Heat is building. Bleaching is possible in the coming weeks.",
    actions: [
      "Watch the reef closely over the next two weeks.",
      "Add clear photos to your observations.",
      "Plan surveys for the cooler morning hours.",
    ],
  },
  {
    level: 2,
    label: "Warning",
    tone: "warning",
    summary: "Heat stress is significant. Bleaching is likely if the heat continues.",
    actions: [
      "Survey the reef soon.",
      "Record bleaching severity, depth, and photos.",
      "Report unusual paling to your reef network.",
    ],
  },
  {
    level: 3,
    label: "Alert Level 1",
    tone: "alert",
    summary: "Significant bleaching is expected at this site.",
    actions: [
      "Survey within days, not weeks.",
      "Log observations for every site you visit.",
      "Share findings with your local reef group.",
    ],
  },
  {
    level: 4,
    label: "Alert Level 2",
    tone: "alert",
    summary: "Severe bleaching and some coral death are likely.",
    actions: [
      "Survey now, then repeat in two weeks.",
      "Photograph the same colonies at each visit.",
      "Send your data to CoralWatch or MERMAID.",
    ],
  },
  {
    level: 5,
    label: "Alert Level 3+",
    tone: "alert",
    summary: "Extreme heat stress. Severe bleaching and mortality are very likely.",
    actions: [
      "Survey immediately where it is safe.",
      "Document mortality as well as bleaching.",
      "Keep the record complete for recovery tracking.",
    ],
  },
];

const UNKNOWN_LEVEL: LevelInfo = {
  label: "Unknown",
  tone: "unknown",
  summary: "No usable satellite values for this site.",
  actions: ["Check the site coordinates.", "Fetch again later."],
};

export interface RiskMetrics {
  sst: number | null;
  ssta: number | null;
  hotspot: number | null;
  dhw: number | null;
  baaByte: number | null;
}

export interface RiskAssessment {
  siteId: string;
  level: number | null;
  label: string;
  tone: RiskTone;
  derived: boolean;
  summary: string;
  actions: string[];
  dataTime: string | null;
  metrics: RiskMetrics;
  notes: string[];
}

function metric(snapshot: SiteSnapshot, key: ProductKey): number | null {
  const value = snapshot.values[key];
  if (!value || !Number.isFinite(value.value)) {
    return null;
  }
  return value.value;
}

/**
 * Approximate level from DHW and HotSpot when the BAA byte is missing.
 * The bands follow the public CRW thresholds (DHW 4 and 8 mark Alert Level 1 and 2).
 */
export function deriveLevelFromDhwAndHotspot(
  dhw: number | null,
  hotspot: number | null,
): number | null {
  if (dhw !== null) {
    if (dhw >= 8) return 4;
    if (dhw >= 4) return 3;
    if (dhw >= 1) return 2;
    if (hotspot !== null && hotspot >= 1) return 1;
    return 0;
  }
  if (hotspot !== null) {
    if (hotspot >= 1) return 1;
    return 0;
  }
  return null;
}

export function assessRisk(snapshot: SiteSnapshot): RiskAssessment {
  const metrics: RiskMetrics = {
    sst: metric(snapshot, "sst"),
    ssta: metric(snapshot, "ssta"),
    hotspot: metric(snapshot, "hotspot"),
    dhw: metric(snapshot, "dhw"),
    baaByte: metric(snapshot, "baa"),
  };
  const notes: string[] = [];
  for (const [key, message] of Object.entries(snapshot.errors)) {
    if (message) {
      notes.push(`${key}: ${message}`);
    }
  }
  let level: number | null = null;
  let derived = false;
  if (metrics.baaByte !== null) {
    level = clamp(Math.round(metrics.baaByte), 0, 5);
  } else {
    const derivedLevel = deriveLevelFromDhwAndHotspot(metrics.dhw, metrics.hotspot);
    if (derivedLevel !== null) {
      level = derivedLevel;
      derived = true;
      notes.push("level estimated from DHW and HotSpot because the BAA value is missing");
    }
  }
  const info: LevelInfo = level === null ? UNKNOWN_LEVEL : ALERT_LEVELS[level];
  return {
    siteId: snapshot.siteId,
    level,
    label: info.label,
    tone: info.tone,
    derived,
    summary: info.summary,
    actions: [...info.actions],
    dataTime: snapshotDataTime(snapshot),
    metrics,
    notes,
  };
}