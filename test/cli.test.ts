import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { defaultConfig } from "../src/config.js";
import { addObservation } from "../src/observations.js";
import { observationsPath } from "../src/observations.js";

const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], cwd: string): RunResult {
  const result = spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: "utf8" });
  return { code: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "coralpulse-cli-"));
}

function writeValidConfig(dir: string): void {
  writeFileSync(join(dir, "coralpulse.json"), JSON.stringify(defaultConfig(), null, 2));
}

function writeCache(dir: string, level: number): void {
  const snapshot = {
    siteId: "davies-reef",
    fetchedAt: "2026-10-20T05:00:00Z",
    values: {
      sst: { key: "sst", time: "2026-10-15T12:00:00Z", latitude: -18.275, longitude: 147.675, value: 25.53 },
      ssta: { key: "ssta", time: "2026-10-15T12:00:00Z", latitude: -18.275, longitude: 147.675, value: -0.09 },
      hotspot: { key: "hotspot", time: "2026-10-15T12:00:00Z", latitude: -18.275, longitude: 147.675, value: -2.96 },
      dhw: { key: "dhw", time: "2026-10-15T12:00:00Z", latitude: -18.275, longitude: 147.675, value: 0 },
      baa: { key: "baa", time: "2026-10-15T12:00:00Z", latitude: -18.275, longitude: 147.675, value: level },
    },
    errors: {},
  };
  mkdirSync(join(dir, "data", "cache"), { recursive: true });
  writeFileSync(join(dir, "data", "cache", "davies-reef.json"), JSON.stringify(snapshot, null, 2));
}

test("cli: --help prints usage and exits 0", () => {
  const result = runCli(["--help"], tempDir());
  assert.equal(result.code, 0);
  assert.ok(result.stdout.includes("Usage: coralpulse"));
});

test("cli: --version prints the package version", () => {
  const result = runCli(["--version"], tempDir());
  assert.equal(result.code, 0);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test("cli: no command and unknown command exit 1", () => {
  const empty = runCli([], tempDir());
  assert.equal(empty.code, 1);
  assert.ok(empty.stderr.includes("no command given"));
  const unknown = runCli(["frobnicate"], tempDir());
  assert.equal(unknown.code, 1);
  assert.ok(unknown.stderr.includes("unknown command"));
});

test("cli: init writes a config and refuses overwrite", () => {
  const dir = tempDir();
  const first = runCli(["init"], dir);
  assert.equal(first.code, 0);
  const written = JSON.parse(readFileSync(join(dir, "coralpulse.json"), "utf8"));
  assert.equal(written.sites[0].id, "davies-reef");

  const second = runCli(["init"], dir);
  assert.equal(second.code, 1);
  assert.ok(second.stderr.includes("already exists"));

  const third = runCli(["init", "--force"], dir);
  assert.equal(third.code, 0);
});

test("cli: validate accepts a good config and reports problems", () => {
  const dir = tempDir();
  writeValidConfig(dir);
  const good = runCli(["validate"], dir);
  assert.equal(good.code, 0);
  assert.ok(good.stdout.includes("config is valid"));

  const cfg = JSON.parse(JSON.stringify(defaultConfig()));
  cfg.sites[0].latitude = 95;
  writeFileSync(join(dir, "coralpulse.json"), JSON.stringify(cfg));
  const bad = runCli(["validate"], dir);
  assert.equal(bad.code, 1);
  assert.ok(bad.stderr.includes("sites[0].latitude"));
  assert.ok(bad.stderr.includes("problem(s)"));
});

test("cli: risk --offline reads the cache and prints a report", () => {
  const dir = tempDir();
  writeValidConfig(dir);
  writeCache(dir, 0);
  const result = runCli(["risk", "--offline"], dir);
  assert.equal(result.code, 0);
  assert.ok(result.stdout.includes("Davies Reef, Great Barrier Reef (davies-reef)"));
  assert.ok(result.stdout.includes("Level: No Stress (0)"));
});

test("cli: risk --offline --json emits machine-readable output", () => {
  const dir = tempDir();
  writeValidConfig(dir);
  writeCache(dir, 4);
  const result = runCli(["risk", "--offline", "--json"], dir);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.sites[0].level, 4);
  assert.equal(parsed.sites[0].label, "Alert Level 2");
});

test("cli: risk --offline without cache reports Unknown and exits 1", () => {
  const dir = tempDir();
  writeValidConfig(dir);
  const result = runCli(["risk", "--offline"], dir);
  assert.equal(result.code, 1);
  assert.ok(result.stdout.includes("Level: Unknown"));
  assert.ok(result.stdout.includes("offline mode: no cached data"));
});

test("cli: observe writes numbered observations", () => {
  const dir = tempDir();
  writeValidConfig(dir);
  const first = runCli(["observe", "--site", "davies-reef", "--date", "2026-10-20", "--score", "3", "--notes", "pale tips"], dir);
  assert.equal(first.code, 0);
  assert.ok(first.stdout.includes("wrote observation obs-davies-reef-20261020-1"));
  const second = runCli(["observe", "--site", "davies-reef", "--date", "2026-10-20", "--bleached", "15"], dir);
  assert.equal(second.code, 0);
  assert.ok(second.stdout.includes("obs-davies-reef-20261020-2"));
  const lines = readFileSync(observationsPath(join(dir, "data")), "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
});

test("cli: observe rejects bad input and unknown sites", () => {
  const dir = tempDir();
  writeValidConfig(dir);
  const missing = runCli(["observe", "--site", "davies-reef"], dir);
  assert.equal(missing.code, 1);
  assert.ok(missing.stderr.includes("at least one"));
  const badScore = runCli(["observe", "--site", "davies-reef", "--score", "9"], dir);
  assert.equal(badScore.code, 1);
  assert.ok(badScore.stderr.includes("score"));
  const unknown = runCli(["observe", "--site", "nope", "--score", "3"], dir);
  assert.equal(unknown.code, 1);
  assert.ok(unknown.stderr.includes("unknown site"));
  const noSite = runCli(["observe", "--score", "3"], dir);
  assert.equal(noSite.code, 1);
  assert.ok(noSite.stderr.includes("--site"));
});

test("cli: export writes CSV to stdout and to a file", () => {
  const dir = tempDir();
  writeValidConfig(dir);
  addObservation(join(dir, "data"), { siteId: "davies-reef", date: "2026-10-19", score: 2, notes: "pale" });
  const out = runCli(["export", "--format", "generic"], dir);
  assert.equal(out.code, 0);
  assert.ok(out.stdout.startsWith("id,site_id,date,score,bleached_percent"));
  assert.ok(out.stdout.includes("obs-davies-reef-20261019-1"));

  const toFile = runCli(["export", "--format", "mermaid", "--out", "out/reef.csv"], dir);
  assert.equal(toFile.code, 0);
  const csv = readFileSync(join(dir, "out", "reef.csv"), "utf8");
  assert.ok(csv.startsWith("site_id,date,latitude,longitude,depth_m,bleached_percent,notes"));
});

test("cli: export rejects bad formats and empty stores", () => {
  const dir = tempDir();
  writeValidConfig(dir);
  const empty = runCli(["export"], dir);
  assert.equal(empty.code, 1);
  assert.ok(empty.stderr.includes("no observations"));
  addObservation(join(dir, "data"), { siteId: "davies-reef", date: "2026-10-19", score: 2 });
  const badFormat = runCli(["export", "--format", "pdf"], dir);
  assert.equal(badFormat.code, 1);
  assert.ok(badFormat.stderr.includes("unknown format"));
});

test("cli: notify --offline --dry-run prints the planned alert", () => {
  const dir = tempDir();
  writeValidConfig(dir);
  writeCache(dir, 4);
  const result = runCli(["notify", "--offline", "--dry-run"], dir);
  assert.equal(result.code, 0);
  assert.ok(result.stdout.includes("would send alert via ntfy:"));
  assert.ok(result.stdout.includes("Title: coralpulse: bleaching alert for 1 site"));
  assert.ok(result.stdout.includes("Alert Level 2"));
});

test("cli: notify stays quiet below the threshold", () => {
  const dir = tempDir();
  writeValidConfig(dir);
  writeCache(dir, 1);
  const result = runCli(["notify", "--offline", "--dry-run"], dir);
  assert.equal(result.code, 0);
  assert.ok(result.stdout.includes("no sites at or above their alert threshold"));
});

test("cli: notify requires a topic when sending", () => {
  const dir = tempDir();
  writeValidConfig(dir);
  writeCache(dir, 4);
  const result = runCli(["notify", "--offline"], dir);
  assert.equal(result.code, 1);
  assert.ok(result.stderr.includes("notify.topic is not set"));
});

test("cli: demo runs offline with bundled data", () => {
  const dir = tempDir();
  const result = runCli(["demo"], dir);
  assert.equal(result.code, 0);
  assert.ok(result.stdout.includes("synthetic"));
  assert.ok(result.stdout.includes("Source: NOAA Coral Reef Watch"));
  const json = runCli(["demo", "--json"], dir);
  assert.equal(json.code, 0);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.sites.length, 2);
  assert.equal(parsed.sites[1].level, 4);
});