import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ConfigError,
  collectConfigIssues,
  collectConfigWarnings,
  defaultConfig,
  loadConfigFile,
} from "../src/config.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "coralpulse-config-"));
}

test("defaultConfig has no errors and one site", () => {
  const config = defaultConfig();
  assert.deepEqual(collectConfigIssues(config), []);
  assert.equal(config.sites.length, 1);
  assert.equal(config.sites[0].id, "davies-reef");
});

test("loadConfigFile reads a valid file", () => {
  const dir = tempDir();
  const path = join(dir, "coralpulse.json");
  writeFileSync(path, JSON.stringify(defaultConfig(), null, 2));
  const config = loadConfigFile(path);
  assert.equal(config.version, 1);
  assert.equal(config.sites[0].name, "Davies Reef, Great Barrier Reef");
});

test("loadConfigFile reports missing files", () => {
  assert.throws(() => loadConfigFile(join(tempDir(), "absent.json")), ConfigError);
  assert.throws(() => loadConfigFile(join(tempDir(), "absent.json")), /cannot read config file/);
});

test("loadConfigFile reports bad JSON", () => {
  const dir = tempDir();
  const path = join(dir, "coralpulse.json");
  writeFileSync(path, "{ not json");
  assert.throws(() => loadConfigFile(path), /not valid JSON/);
});

test("collectConfigIssues finds each problem class", () => {
  const config = defaultConfig();
  const raw = JSON.parse(JSON.stringify(config));
  raw.version = 2;
  raw.dataDir = "";
  raw.sites = [
    { id: "", name: "", latitude: 91, longitude: -181, minAlertLevel: 9 },
    { id: "dup", name: "A", latitude: 0, longitude: 0 },
    { id: "dup", name: "B", latitude: 0, longitude: 0 },
  ];
  raw.risk = { cacheHours: 0 };
  const issues = collectConfigIssues(raw);
  assert.ok(issues.some((i) => i.includes("version must be 1")));
  assert.ok(issues.some((i) => i.includes("dataDir")));
  assert.ok(issues.some((i) => i.includes("sites[0].id")));
  assert.ok(issues.some((i) => i.includes("sites[0].name")));
  assert.ok(issues.some((i) => i.includes("sites[0].latitude")));
  assert.ok(issues.some((i) => i.includes("sites[0].longitude")));
  assert.ok(issues.some((i) => i.includes("sites[0].minAlertLevel")));
  assert.ok(issues.some((i) => i.includes("duplicate")));
  assert.ok(issues.some((i) => i.includes("risk.cacheHours")));
});

test("collectConfigIssues rejects empty sites and non-objects", () => {
  const raw = { version: 1, dataDir: "data", sites: [] };
  assert.deepEqual(collectConfigIssues(raw as never), ["sites must be a non-empty array"]);

  const raw2 = { version: 1, dataDir: "data", sites: [null] };
  const issues = collectConfigIssues(raw2 as never);
  assert.ok(issues.some((i) => i.includes("sites[0] must be an object")));
});

test("collectConfigWarnings flags noisy site ids and empty topic", () => {
  const config = defaultConfig();
  config.sites[0].id = "My Site";
  const warnings = collectConfigWarnings(config);
  assert.ok(warnings.some((w) => w.includes("not lowercase")));
  assert.ok(warnings.some((w) => w.includes("notify.topic")));
});