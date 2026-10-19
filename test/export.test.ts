import { test } from "node:test";
import assert from "node:assert/strict";

import { EXPORT_FORMATS, csvEscape, observationsToCsv } from "../src/export.js";
import type { Observation } from "../src/observations.js";

function obs(partial: Partial<Observation>): Observation {
  return {
    id: "obs-a-20261019-1",
    siteId: "a",
    date: "2026-10-19",
    score: null,
    bleachedPercent: null,
    depthM: null,
    latitude: null,
    longitude: null,
    photo: null,
    notes: "",
    createdAt: "2026-10-19T08:00:00Z",
    ...partial,
  };
}

test("csvEscape quotes commas, quotes, and newlines", () => {
  assert.equal(csvEscape("plain"), "plain");
  assert.equal(csvEscape("a,b"), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape("line1\nline2"), '"line1\nline2"');
});

test("EXPORT_FORMATS lists the three formats", () => {
  assert.deepEqual(EXPORT_FORMATS, ["generic", "coralwatch", "mermaid"]);
});

test("observationsToCsv generic emits all fields", () => {
  const csv = observationsToCsv(
    [
      obs({ score: 3, bleachedPercent: 10, notes: "some pale tips" }),
      obs({ id: "obs-a-20261020-1", date: "2026-10-20", bleachedPercent: 25, depthM: 4.5, latitude: -18.2, longitude: 147.6, photo: "p.jpg" }),
    ],
    "generic",
  );
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines.length, 3);
  assert.equal(
    lines[0],
    "id,site_id,date,score,bleached_percent,depth_m,latitude,longitude,photo,notes,created_at",
  );
  assert.ok(lines[1].startsWith("obs-a-20261019-1,a,2026-10-19,3,10,"));
  assert.ok(lines[2].includes("obs-a-20261020-1,a,2026-10-20,,25,4.5,-18.2,147.6,p.jpg"));
});

test("observationsToCsv escapes notes with commas and quotes", () => {
  const csv = observationsToCsv([obs({ score: 1, notes: 'pale, "worrying"' })], "generic");
  assert.ok(csv.includes('"pale, ""worrying"""'));
});

test("observationsToCsv coralwatch uses colour_score", () => {
  const csv = observationsToCsv([obs({ score: 4, depthM: 2 })], "coralwatch");
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines[0], "date,site,latitude,longitude,depth_m,colour_score,bleached_percent,notes");
  assert.equal(lines[1], "2026-10-19,a,,,2,4,,");
});

test("observationsToCsv mermaid uses bleached_percent as the metric", () => {
  const csv = observationsToCsv([obs({ bleachedPercent: 30, notes: "branching corals paling" })], "mermaid");
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines[0], "site_id,date,latitude,longitude,depth_m,bleached_percent,notes");
  assert.equal(lines[1], "a,2026-10-19,,,,30,branching corals paling");
});

test("observationsToCsv sorts by date then id", () => {
  const csv = observationsToCsv(
    [
      obs({ id: "obs-a-20261021-1", date: "2026-10-21", score: 1 }),
      obs({ id: "obs-a-20261019-2", date: "2026-10-19", score: 2 }),
      obs({ id: "obs-a-20261019-1", date: "2026-10-19", score: 3 }),
    ],
    "generic",
  );
  const lines = csv.trimEnd().split("\n");
  assert.ok(lines[1].includes("obs-a-20261019-1"));
  assert.ok(lines[2].includes("obs-a-20261019-2"));
  assert.ok(lines[3].includes("obs-a-20261021-1"));
});

test("observationsToCsv with no observations emits the header only", () => {
  const csv = observationsToCsv([], "mermaid");
  assert.equal(csv, "site_id,date,latitude,longitude,depth_m,bleached_percent,notes\n");
});