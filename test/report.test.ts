import { test } from "node:test";
import assert from "node:assert/strict";

import { formatAgeDays, formatRiskJson, formatRiskText, formatValue } from "../src/report.js";
import { assessRisk } from "../src/risk.js";
import type { SiteSnapshot } from "../src/crw.js";

function snap(values: SiteSnapshot["values"]): SiteSnapshot {
  return { siteId: "davies-reef", fetchedAt: "2026-10-20T06:00:00Z", values, errors: {} };
}

const NOW = new Date("2026-10-20T06:00:00Z");

const stressed = snap({
  sst: { key: "sst", time: "2026-10-15T12:00:00Z", latitude: -18.275, longitude: 147.675, value: 29.31 },
  ssta: { key: "ssta", time: "2026-10-15T12:00:00Z", latitude: -18.275, longitude: 147.675, value: 1.22 },
  hotspot: { key: "hotspot", time: "2026-10-15T12:00:00Z", latitude: -18.275, longitude: 147.675, value: 1.41 },
  dhw: { key: "dhw", time: "2026-10-15T12:00:00Z", latitude: -18.275, longitude: 147.675, value: 4.62 },
  baa: { key: "baa", time: "2026-10-15T12:00:00Z", latitude: -18.275, longitude: 147.675, value: 3 },
});

test("formatValue renders numbers, zeroes, and missing values", () => {
  assert.equal(formatValue(25.53), "25.5");
  assert.equal(formatValue(0), "0.0");
  assert.equal(formatValue(null), "—");
  assert.equal(formatValue(Number.NaN), "—");
  assert.equal(formatValue(4.62, 2), "4.62");
});

test("formatAgeDays reports day counts", () => {
  assert.equal(formatAgeDays("2026-10-15T12:00:00Z", NOW), "5 days old");
  assert.equal(formatAgeDays("2026-10-19T20:00:00Z", NOW), "less than a day old");
  assert.equal(formatAgeDays(null, NOW), "no data date");
  assert.equal(formatAgeDays("garbage", NOW), "unknown date");
});

test("formatRiskText renders a full report", () => {
  const text = formatRiskText(
    [{ siteId: "davies-reef", name: "Davies Reef, Great Barrier Reef", assessment: assessRisk(stressed) }],
    NOW,
  );
  assert.ok(text.includes("Davies Reef, Great Barrier Reef (davies-reef)"));
  assert.ok(text.includes("Level: Alert Level 1 (3)"));
  assert.ok(text.includes("Data date: 2026-10-15T12:00:00Z (5 days old)"));
  assert.ok(text.includes("SST 29.3 °C"));
  assert.ok(text.includes("DHW 4.6 °C-weeks"));
  assert.ok(text.includes("Next actions:"));
  assert.ok(text.includes("Survey within days, not weeks."));
  assert.ok(text.includes("Source: NOAA Coral Reef Watch"));
});

test("formatRiskText marks estimated levels", () => {
  const derived = snap({
    dhw: { key: "dhw", time: "2026-10-15T12:00:00Z", latitude: -18.275, longitude: 147.675, value: 8.4 },
  });
  const text = formatRiskText(
    [{ siteId: "davies-reef", name: "Davies Reef", assessment: assessRisk(derived) }],
    NOW,
  );
  assert.ok(text.includes("[estimated]"));
  assert.ok(text.includes("Note: level estimated from DHW"));
});

test("formatRiskText handles the unknown state", () => {
  const empty = snap({
    baa: { key: "baa", time: "", latitude: -18.275, longitude: 147.675, value: Number.NaN },
  });
  const text = formatRiskText([{ siteId: "x", name: "Empty Site", assessment: assessRisk(empty) }], NOW);
  assert.ok(text.includes("Level: Unknown"));
  assert.ok(text.includes("Data date: unknown"));
  assert.ok(text.includes("No usable satellite values"));
});

test("formatRiskJson emits machine-readable output", () => {
  const json = JSON.parse(
    formatRiskJson(
      [{ siteId: "davies-reef", name: "Davies Reef, Great Barrier Reef", assessment: assessRisk(stressed) }],
      NOW,
    ),
  );
  assert.equal(json.tool, "coralpulse");
  assert.equal(json.generatedAt, "2026-10-20T06:00:00.000Z");
  assert.equal(json.sites.length, 1);
  assert.equal(json.sites[0].siteId, "davies-reef");
  assert.equal(json.sites[0].level, 3);
  assert.equal(json.sites[0].label, "Alert Level 1");
  assert.equal(json.sites[0].metrics.dhw, 4.62);
});