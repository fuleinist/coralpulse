import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALERT_LEVELS,
  assessRisk,
  deriveLevelFromDhwAndHotspot,
} from "../src/risk.js";
import type { ProductKey, SiteSnapshot } from "../src/crw.js";

function snap(
  values: Partial<Record<ProductKey, number>>,
  errors: Partial<Record<ProductKey, string>> = {},
): SiteSnapshot {
  const stored: SiteSnapshot["values"] = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      stored[key as ProductKey] = {
        key: key as ProductKey,
        time: "2026-10-15T12:00:00Z",
        latitude: -18.275,
        longitude: 147.675,
        value,
      };
    }
  }
  return { siteId: "davies-reef", fetchedAt: "2026-10-20T06:00:00Z", values: stored, errors };
}

test("ALERT_LEVELS defines six levels with guidance", () => {
  assert.equal(ALERT_LEVELS.length, 6);
  assert.deepEqual(
    ALERT_LEVELS.map((l) => l.level),
    [0, 1, 2, 3, 4, 5],
  );
  for (const info of ALERT_LEVELS) {
    assert.ok(info.label.length > 0);
    assert.ok(info.summary.length > 0);
    assert.ok(info.actions.length >= 2);
  }
});

test("assessRisk maps the BAA byte directly", () => {
  const risk = assessRisk(snap({ sst: 29.1, ssta: 1.2, hotspot: 1.1, dhw: 4.6, baa: 3 }));
  assert.equal(risk.level, 3);
  assert.equal(risk.label, "Alert Level 1");
  assert.equal(risk.derived, false);
  assert.equal(risk.tone, "alert");
  assert.equal(risk.metrics.dhw, 4.6);
});

test("assessRisk clamps and rounds the byte", () => {
  assert.equal(assessRisk(snap({ baa: 9 })).level, 5);
  assert.equal(assessRisk(snap({ baa: 3.6 })).level, 4);
  assert.equal(assessRisk(snap({ baa: 0 })).label, "No Stress");
});

test("assessRisk derives from DHW when BAA is missing", () => {
  const risk = assessRisk(snap({ sst: 30.2, dhw: 8.4 }));
  assert.equal(risk.level, 4);
  assert.equal(risk.derived, true);
  assert.ok(risk.notes.some((n) => n.includes("estimated from DHW")));
});

test("assessRisk derivation bands", () => {
  assert.equal(assessRisk(snap({ dhw: 4.5 })).level, 3);
  assert.equal(assessRisk(snap({ dhw: 1.5 })).level, 2);
  assert.equal(assessRisk(snap({ dhw: 0.2, hotspot: 0.3 })).level, 0);
  assert.equal(assessRisk(snap({ hotspot: 1.2 })).level, 1);
});

test("deriveLevelFromDhwAndHotspot table", () => {
  assert.equal(deriveLevelFromDhwAndHotspot(null, null), null);
  assert.equal(deriveLevelFromDhwAndHotspot(9, null), 4);
  assert.equal(deriveLevelFromDhwAndHotspot(7.9, null), 3);
  assert.equal(deriveLevelFromDhwAndHotspot(3.9, 2), 2);
  assert.equal(deriveLevelFromDhwAndHotspot(0, 1.5), 1);
  assert.equal(deriveLevelFromDhwAndHotspot(0, -1), 0);
  assert.equal(deriveLevelFromDhwAndHotspot(null, 3), 1);
  assert.equal(deriveLevelFromDhwAndHotspot(null, 0.4), 0);
});

test("assessRisk returns Unknown when nothing usable exists", () => {
  const risk = assessRisk(snap({}));
  assert.equal(risk.level, null);
  assert.equal(risk.label, "Unknown");
  assert.equal(risk.tone, "unknown");
  assert.equal(risk.dataTime, null);
});

test("assessRisk treats NaN values as missing", () => {
  const risk = assessRisk(snap({ baa: Number.NaN, dhw: Number.NaN, hotspot: 2 }));
  assert.equal(risk.level, 1);
  assert.equal(risk.derived, true);
  assert.equal(risk.metrics.baaByte, null);
  const empty = assessRisk(snap({ baa: Number.NaN, dhw: Number.NaN }));
  assert.equal(empty.level, null);
});

test("assessRisk copies per-product errors into notes", () => {
  const risk = assessRisk(snap({ baa: 0 }, { sst: "HTTP 503 from noaacrwsstDaily" }));
  assert.ok(risk.notes.some((n) => n.includes("sst: HTTP 503")));
  assert.equal(risk.metrics.sst, null);
});

test("assessRisk carries the data time", () => {
  const risk = assessRisk(snap({ baa: 0, sst: 25.53 }));
  assert.equal(risk.dataTime, "2026-10-15T12:00:00Z");
});