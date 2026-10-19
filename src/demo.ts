/**
 * coralpulse demo data. Runs fully offline. No network calls.
 *
 * The first site uses a snapshot captured from the live service on 2026-10-15.
 * The second site uses synthetic values. It shows an active alert state.
 */
import type { ProductKey, SiteSnapshot } from "./crw.js";
import { assessRisk } from "./risk.js";
import type { RiskEntry } from "./report.js";

function makeSnapshot(
  siteId: string,
  time: string,
  values: Partial<Record<ProductKey, number>>,
): SiteSnapshot {
  const stored: SiteSnapshot["values"] = {};
  for (const [key, num] of Object.entries(values)) {
    if (num !== undefined) {
      stored[key as ProductKey] = {
        key: key as ProductKey,
        time,
        latitude: -18.275,
        longitude: 147.675,
        value: num,
      };
    }
  }
  return { siteId, fetchedAt: "2026-10-20T06:00:00Z", values: stored, errors: {} };
}

export function demoRiskEntries(): RiskEntry[] {
  const captured = makeSnapshot("davies-reef", "2026-10-15T12:00:00Z", {
    sst: 25.53,
    ssta: -0.09,
    hotspot: -2.96,
    dhw: 0,
    baa: 0,
  });
  const synthetic = makeSnapshot("example-reef", "2026-10-15T12:00:00Z", {
    sst: 30.41,
    ssta: 1.72,
    hotspot: 1.63,
    dhw: 7.42,
    baa: 4,
  });
  const entries: RiskEntry[] = [
    {
      siteId: "davies-reef",
      name: "Davies Reef, Great Barrier Reef (captured)",
      assessment: assessRisk(captured),
    },
    {
      siteId: "example-reef",
      name: "Example Reef (synthetic)",
      assessment: assessRisk(synthetic),
    },
  ];
  entries[1].assessment.notes.push("synthetic values for demo only; not a real reef reading");
  return entries;
}