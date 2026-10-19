import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  addObservation,
  loadObservations,
  makeObservationId,
  observationsPath,
  summarizeObservations,
  validateObservationInput,
} from "../src/observations.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "coralpulse-obs-"));
}

test("validateObservationInput accepts a score-only observation", () => {
  const problems = validateObservationInput({ siteId: "davies-reef", date: "2026-10-20", score: 3 });
  assert.deepEqual(problems, []);
});

test("validateObservationInput accepts a percent-only observation", () => {
  const problems = validateObservationInput({
    siteId: "davies-reef",
    date: "2026-10-20",
    bleachedPercent: 25,
    depthM: 4,
    latitude: -18.2,
    longitude: 147.6,
  });
  assert.deepEqual(problems, []);
});

test("validateObservationInput finds each problem", () => {
  const problems = validateObservationInput({
    siteId: "",
    date: "20-10-2026",
    score: 7,
    bleachedPercent: 101,
    depthM: -1,
    latitude: 91,
    longitude: -181,
  });
  assert.ok(problems.some((p) => p.includes("siteId")));
  assert.ok(problems.some((p) => p.includes("date")));
  assert.ok(problems.some((p) => p.includes("score")));
  assert.ok(problems.some((p) => p.includes("bleachedPercent")));
  assert.ok(problems.some((p) => p.includes("depthM")));
  assert.ok(problems.some((p) => p.includes("latitude")));
  assert.ok(problems.some((p) => p.includes("longitude")));
});

test("validateObservationInput requires score or bleachedPercent", () => {
  const problems = validateObservationInput({ siteId: "x", date: "2026-10-20" });
  assert.ok(problems.some((p) => p.includes("at least one")));
});

test("validateObservationInput rejects fractional scores", () => {
  const problems = validateObservationInput({ siteId: "x", date: "2026-10-20", score: 2.5 });
  assert.ok(problems.some((p) => p.includes("score")));
});

test("makeObservationId numbers observations per site and date", () => {
  const existing = [
    {
      id: "obs-x-20261020-1",
      siteId: "x",
      date: "2026-10-20",
      score: 1,
      bleachedPercent: null,
      depthM: null,
      latitude: null,
      longitude: null,
      photo: null,
      notes: "",
      createdAt: "2026-10-20T00:00:00Z",
    },
  ];
  assert.equal(makeObservationId("x", "2026-10-20", existing), "obs-x-20261020-2");
  assert.equal(makeObservationId("y", "2026-10-20", existing), "obs-y-20261020-1");
});

test("addObservation appends and loadObservations reads back", () => {
  const dir = tempDir();
  const first = addObservation(dir, { siteId: "davies-reef", date: "2026-10-19", score: 2, notes: "pale" });
  const second = addObservation(dir, {
    siteId: "davies-reef",
    date: "2026-10-19",
    bleachedPercent: 15,
    photo: "photos/reef1.jpg",
  });
  assert.equal(first.id, "obs-davies-reef-20261019-1");
  assert.equal(second.id, "obs-davies-reef-20261019-2");
  const list = loadObservations(dir);
  assert.equal(list.length, 2);
  assert.equal(list[0].notes, "pale");
  assert.equal(list[1].bleachedPercent, 15);
  assert.equal(list[1].photo, "photos/reef1.jpg");
  assert.equal(list[1].score, null);
  const text = readFileSync(observationsPath(dir), "utf8");
  assert.equal(text.split("\n").filter((l) => l.trim().length > 0).length, 2);
});

test("loadObservations returns an empty list without a file", () => {
  assert.deepEqual(loadObservations(tempDir()), []);
});

test("loadObservations skips corrupt lines", () => {
  const dir = tempDir();
  addObservation(dir, { siteId: "x", date: "2026-10-20", score: 1 });
  writeFileSync(observationsPath(dir), `{ bad json\n${readFileSync(observationsPath(dir), "utf8")}`);
  const list = loadObservations(dir);
  assert.equal(list.length, 1);
  assert.equal(list[0].siteId, "x");
});

test("summarizeObservations counts by site", () => {
  const dir = tempDir();
  addObservation(dir, { siteId: "a", date: "2026-10-20", score: 1 });
  addObservation(dir, { siteId: "a", date: "2026-10-21", score: 1 });
  addObservation(dir, { siteId: "b", date: "2026-10-21", score: 2 });
  const summary = summarizeObservations(loadObservations(dir));
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.bySite, { a: 2, b: 1 });
});