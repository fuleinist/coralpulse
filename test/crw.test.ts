import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CRW_PRODUCTS,
  buildPointQueryUrl,
  fetchPoint,
  fetchSiteSnapshot,
  isSnapshotFresh,
  loadSnapshot,
  parseSinglePointCsv,
  saveSnapshot,
  snapshotDataTime,
  type SiteSnapshot,
} from "../src/crw.js";

// Fixtures captured from the live CoastWatch ERDDAP service on 2026-10-20.
const FIXTURES: Record<string, string> = {
  dhw: "time,latitude,longitude,degree_heating_week\nUTC,degrees_north,degrees_east,degree_Celsius_weeks\n2026-10-15T12:00:00Z,-18.275,147.675,0.0\n",
  sst: "time,latitude,longitude,analysed_sst\nUTC,degrees_north,degrees_east,degree_C\n2026-10-15T12:00:00Z,-18.275,147.675,25.53\n",
  ssta: "time,latitude,longitude,sea_surface_temperature_anomaly\nUTC,degrees_north,degrees_east,degree_C\n2026-10-15T12:00:00Z,-18.275,147.675,-0.09\n",
  hotspot: "time,latitude,longitude,hotspot\nUTC,degrees_north,degrees_east,degree_C\n2026-10-15T12:00:00Z,-18.275,147.675,-2.96\n",
  baa: "time,latitude,longitude,bleaching_alert_area\nUTC,degrees_north,degrees_east,stress_level\n2026-10-15T12:00:00Z,-18.275,147.675,0\n",
};

function fixtureFor(url: string): string | null {
  for (const spec of CRW_PRODUCTS) {
    if (url.includes(spec.datasetId)) {
      return FIXTURES[spec.key];
    }
  }
  return null;
}

function mockFetch(handler?: (url: string) => Response | null): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const custom = handler?.(url);
    if (custom) {
      return custom;
    }
    const fixture = fixtureFor(url);
    if (fixture !== null) {
      return new Response(fixture, { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

test("CRW_PRODUCTS covers the five products with unique keys", () => {
  assert.equal(CRW_PRODUCTS.length, 5);
  const keys = new Set(CRW_PRODUCTS.map((p) => p.key));
  assert.equal(keys.size, 5);
});

test("buildPointQueryUrl encodes brackets, parens, and coordinates", () => {
  const spec = CRW_PRODUCTS.find((p) => p.key === "dhw")!;
  const url = buildPointQueryUrl(spec, -18.2871, 147.6992);
  assert.ok(url.startsWith("https://coastwatch.noaa.gov/erddap/griddap/noaacrwdhwDaily.csv?degree_heating_week"));
  assert.ok(url.includes("%5B%28last%29%5D"));
  assert.ok(url.includes("%5B%28-18.2871%29%5D"));
  assert.ok(url.includes("%5B%28147.6992%29%5D"));
  assert.ok(!url.includes("["));
  assert.ok(!url.includes("("));
});

test("parseSinglePointCsv reads the captured dhw payload", () => {
  const row = parseSinglePointCsv(FIXTURES.dhw);
  assert.equal(row.time, "2026-10-15T12:00:00Z");
  assert.equal(row.latitude, -18.275);
  assert.equal(row.longitude, 147.675);
  assert.equal(row.value, 0);
});

test("parseSinglePointCsv keeps negative values and NaN", () => {
  const neg = parseSinglePointCsv(FIXTURES.ssta);
  assert.equal(neg.value, -0.09);
  const nan = parseSinglePointCsv(
    "time,latitude,longitude,hotspot\nUTC,degrees_north,degrees_east,degree_C\n2026-10-15T12:00:00Z,-18.275,147.675,NaN\n",
  );
  assert.ok(Number.isNaN(nan.value));
});

test("parseSinglePointCsv rejects short payloads", () => {
  assert.throws(() => parseSinglePointCsv(""), /unexpected CSV payload/);
  assert.throws(() => parseSinglePointCsv("a,b,c\n1,2,3\n"), /unexpected CSV payload/);
  assert.throws(() => parseSinglePointCsv("h1\na\n1\n"), /unexpected CSV row/);
});

test("fetchPoint returns a typed value", async () => {
  const spec = CRW_PRODUCTS.find((p) => p.key === "baa")!;
  const value = await fetchPoint(spec, -18.2871, 147.6992, mockFetch());
  assert.equal(value.key, "baa");
  assert.equal(value.time, "2026-10-15T12:00:00Z");
  assert.equal(value.value, 0);
});

test("fetchPoint reports HTTP failures", async () => {
  const spec = CRW_PRODUCTS.find((p) => p.key === "sst")!;
  const failing = mockFetch(() => new Response("boom", { status: 500 }));
  await assert.rejects(() => fetchPoint(spec, -18.2871, 147.6992, failing), /HTTP 500 from noaacrwsstDaily/);
});

test("fetchSiteSnapshot fetches all five products", async () => {
  const snapshot = await fetchSiteSnapshot({ id: "davies-reef", latitude: -18.2871, longitude: 147.6992 }, mockFetch());
  assert.equal(snapshot.siteId, "davies-reef");
  assert.equal(Object.keys(snapshot.values).length, 5);
  assert.deepEqual(snapshot.errors, {});
  assert.equal(snapshot.values.dhw?.value, 0);
  assert.equal(snapshot.values.sst?.value, 25.53);
  assert.equal(snapshot.values.baa?.value, 0);
  assert.ok(!Number.isNaN(Date.parse(snapshot.fetchedAt)));
});

test("fetchSiteSnapshot records per-product errors and keeps the rest", async () => {
  const partial = mockFetch((url) => {
    if (url.includes("noaacrwdhwDaily")) {
      return new Response("boom", { status: 503 });
    }
    return null;
  });
  const snapshot = await fetchSiteSnapshot({ id: "x", latitude: 0, longitude: 0 }, partial);
  assert.equal(snapshot.values.dhw, undefined);
  assert.match(snapshot.errors.dhw ?? "", /HTTP 503/);
  assert.equal(Object.keys(snapshot.values).length, 4);
});

test("saveSnapshot and loadSnapshot round-trip through a temp dir", async () => {
  const dir = mkdtempSync(join(tmpdir(), "coralpulse-crw-"));
  const snapshot = await fetchSiteSnapshot({ id: "davies-reef", latitude: -18.2871, longitude: 147.6992 }, mockFetch());
  const path = saveSnapshot(snapshot, dir);
  assert.ok(path.endsWith(join("cache", "davies-reef.json")));
  const loaded = loadSnapshot("davies-reef", dir);
  assert.equal(loaded?.siteId, "davies-reef");
  assert.equal(loaded?.values.sst?.value, 25.53);
  assert.equal(loadSnapshot("absent", dir), null);
});

test("loadSnapshot returns null for corrupt files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "coralpulse-crw-"));
  const snapshot = await fetchSiteSnapshot({ id: "site-1", latitude: 0, longitude: 0 }, mockFetch());
  saveSnapshot(snapshot, dir);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(dir, "cache", "site-1.json"), "{ bad json");
  assert.equal(loadSnapshot("site-1", dir), null);
});

test("isSnapshotFresh uses the cache window", () => {
  const now = new Date("2026-10-20T06:00:00Z");
  const fresh: SiteSnapshot = { siteId: "a", fetchedAt: "2026-10-20T02:00:00Z", values: {}, errors: {} };
  const stale: SiteSnapshot = { siteId: "a", fetchedAt: "2026-10-19T15:00:00Z", values: {}, errors: {} };
  assert.equal(isSnapshotFresh(fresh, 12, now), true);
  assert.equal(isSnapshotFresh(stale, 12, now), false);
  assert.equal(isSnapshotFresh({ ...fresh, fetchedAt: "garbage" }, 12, now), false);
});

test("snapshotDataTime returns the latest product time", async () => {
  const snapshot = await fetchSiteSnapshot({ id: "a", latitude: 0, longitude: 0 }, mockFetch());
  assert.equal(snapshotDataTime(snapshot), "2026-10-15T12:00:00Z");
  assert.equal(snapshotDataTime({ siteId: "b", fetchedAt: "x", values: {}, errors: {} }), null);
});