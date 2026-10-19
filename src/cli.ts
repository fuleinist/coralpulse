#!/usr/bin/env node
/**
 * coralpulse — command line interface.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ConfigError,
  DEFAULT_CACHE_HOURS,
  DEFAULT_MIN_ALERT_LEVEL,
  collectConfigIssues,
  collectConfigWarnings,
  defaultConfig,
  loadConfigFile,
  type CoralpulseConfig,
} from "./config.js";
import {
  fetchSiteSnapshot,
  isSnapshotFresh,
  loadSnapshot,
  saveSnapshot,
  snapshotDataTime,
  type SiteSnapshot,
} from "./crw.js";
import { assessRisk } from "./risk.js";
import { formatRiskJson, formatRiskText, type RiskEntry } from "./report.js";
import {
  addObservation,
  loadObservations,
  observationsPath,
  validateObservationInput,
} from "./observations.js";
import { EXPORT_FORMATS, observationsToCsv, type ExportFormat } from "./export.js";
import { buildAlert, effectiveServer, sendNtfy } from "./notify.js";
import { demoRiskEntries } from "./demo.js";
import { todayISO } from "./util.js";

export class CliUsageError extends Error {}

export interface CliOptions {
  command: string;
  configPath: string;
  json: boolean;
  force: boolean;
  offline: boolean;
  dryRun: boolean;
  now?: string;
  site?: string;
  date?: string;
  score?: number;
  bleached?: number;
  depth?: number;
  lat?: number;
  lon?: number;
  photo?: string;
  notes?: string;
  format?: string;
  out?: string;
  help: boolean;
  version: boolean;
}

const USAGE = `coralpulse — bleaching early-warning companion for reef communities

Usage: coralpulse <command> [options]

Commands:
  init                 write a template coralpulse.json
  validate             check coralpulse.json for problems
  fetch                download the latest CRW values into the cache
  risk                 show the current risk per site
  observe              add a field observation
  export               write observations as CSV
  notify               send ntfy alerts for sites at or above their threshold
  demo                 run offline with bundled sample data

Options:
  --config <file>      config file (default: coralpulse.json)
  --json               print risk or demo output as JSON
  --offline            never call the network; use cached data
  --force              overwrite files where allowed
  --now <timestamp>    override the current time (ISO 8601)
  --site <id>          site id (observe)
  --date <YYYY-MM-DD>  observation date (default: today)
  --score <1-6>        CoralWatch colour score
  --bleached <0-100>   percent of bleached coral
  --depth <m>          depth in metres
  --lat <deg>          latitude of the observation
  --lon <deg>          longitude of the observation
  --photo <path>       photo file path
  --notes <text>       free-text notes
  --format <name>      export format: generic | coralwatch | mermaid
  --out <file>         write CSV to a file instead of stdout
  --dry-run            print alerts instead of sending them
  -h, --help           show this help
  -v, --version        show the version`;

function needValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new CliUsageError(`option ${flag} needs a value`);
  }
  return value;
}

function needNumber(argv: string[], index: number, flag: string): number {
  const raw = needValue(argv, index, flag);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new CliUsageError(`option ${flag} needs a number, got: ${raw}`);
  }
  return value;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: "",
    configPath: "coralpulse.json",
    json: false,
    force: false,
    offline: false,
    dryRun: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      options.configPath = needValue(argv, (i += 1), arg);
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--offline") {
      options.offline = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--now") {
      options.now = needValue(argv, (i += 1), arg);
    } else if (arg === "--site") {
      options.site = needValue(argv, (i += 1), arg);
    } else if (arg === "--date") {
      options.date = needValue(argv, (i += 1), arg);
    } else if (arg === "--score") {
      options.score = needNumber(argv, (i += 1), arg);
    } else if (arg === "--bleached") {
      options.bleached = needNumber(argv, (i += 1), arg);
    } else if (arg === "--depth") {
      options.depth = needNumber(argv, (i += 1), arg);
    } else if (arg === "--lat") {
      options.lat = needNumber(argv, (i += 1), arg);
    } else if (arg === "--lon") {
      options.lon = needNumber(argv, (i += 1), arg);
    } else if (arg === "--photo") {
      options.photo = needValue(argv, (i += 1), arg);
    } else if (arg === "--notes") {
      options.notes = needValue(argv, (i += 1), arg);
    } else if (arg === "--format") {
      options.format = needValue(argv, (i += 1), arg);
    } else if (arg === "--out") {
      options.out = needValue(argv, (i += 1), arg);
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "-v" || arg === "--version") {
      options.version = true;
    } else if (arg.startsWith("-")) {
      throw new CliUsageError(`unknown option: ${arg}`);
    } else if (options.command === "") {
      options.command = arg;
    } else {
      throw new CliUsageError(`unexpected argument: ${arg}`);
    }
  }
  return options;
}

function parseNow(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CliUsageError(`invalid --now value: ${value}`);
  }
  return date;
}

function packageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")) as {
      version?: string;
    };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function loadOperationalConfig(options: CliOptions): CoralpulseConfig {
  const config = loadConfigFile(options.configPath);
  const issues = collectConfigIssues(config);
  if (issues.length > 0) {
    throw new ConfigError(`${issues.length} config problem(s) in ${options.configPath}; run validate for details`);
  }
  return config;
}

function emptySnapshot(siteId: string, now: Date): SiteSnapshot {
  return { siteId, fetchedAt: now.toISOString(), values: {}, errors: {} };
}

async function collectRiskEntries(
  config: CoralpulseConfig,
  options: CliOptions,
  now: Date,
): Promise<RiskEntry[]> {
  const entries: RiskEntry[] = [];
  const cacheHours = config.risk?.cacheHours ?? DEFAULT_CACHE_HOURS;
  for (const site of config.sites) {
    const cached = loadSnapshot(site.id, config.dataDir);
    let snapshot = cached;
    let fetchError: string | null = null;
    const stale = snapshot === null || !isSnapshotFresh(snapshot, cacheHours, now);
    if (!options.offline && stale) {
      try {
        snapshot = await fetchSiteSnapshot(site);
        saveSnapshot(snapshot, config.dataDir);
      } catch (err) {
        fetchError = err instanceof Error ? err.message : String(err);
      }
    }
    if (snapshot === null) {
      snapshot = emptySnapshot(site.id, now);
    }
    const assessment = assessRisk(snapshot);
    if (options.offline && cached === null) {
      assessment.notes.push("offline mode: no cached data for this site");
    }
    if (fetchError !== null) {
      assessment.notes.push(
        cached === null
          ? `live fetch failed (${fetchError}); no cached data for this site`
          : `live fetch failed (${fetchError}); using cached data`,
      );
    }
    entries.push({ siteId: site.id, name: site.name, assessment });
  }
  return entries;
}

function runInit(options: CliOptions): number {
  if (existsSync(options.configPath) && !options.force) {
    console.error(`config already exists: ${options.configPath} (use --force to overwrite)`);
    return 1;
  }
  writeFileSync(options.configPath, `${JSON.stringify(defaultConfig(), null, 2)}\n`);
  console.log(`wrote ${options.configPath}`);
  console.log("edit the sites, then run: coralpulse validate");
  return 0;
}

function runValidate(options: CliOptions): number {
  const config = loadConfigFile(options.configPath);
  const issues = collectConfigIssues(config);
  const warnings = collectConfigWarnings(config);
  for (const warning of warnings) {
    console.error(`warning: ${warning}`);
  }
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`problem: ${issue}`);
    }
    console.error(`${issues.length} problem(s) found in ${options.configPath}`);
    return 1;
  }
  console.log(`config is valid: ${options.configPath}`);
  return 0;
}

async function runFetch(options: CliOptions): Promise<number> {
  const config = loadOperationalConfig(options);
  let failures = 0;
  for (const site of config.sites) {
    try {
      const snapshot = await fetchSiteSnapshot(site);
      saveSnapshot(snapshot, config.dataDir);
      const ok = Object.keys(snapshot.values).length;
      console.log(`fetched ${site.id}: ${ok}/5 products (data ${snapshotDataTime(snapshot) ?? "unknown"})`);
      for (const [key, message] of Object.entries(snapshot.errors)) {
        if (message) {
          console.error(`  error ${key}: ${message}`);
        }
      }
      if (ok === 0) {
        failures += 1;
      }
    } catch (err) {
      failures += 1;
      console.error(`fetch failed for ${site.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return failures === config.sites.length ? 1 : 0;
}

async function runRisk(options: CliOptions): Promise<number> {
  const config = loadOperationalConfig(options);
  const now = options.now ? parseNow(options.now) : new Date();
  const entries = await collectRiskEntries(config, options, now);
  if (options.json) {
    console.log(formatRiskJson(entries, now));
  } else {
    console.log(formatRiskText(entries, now));
  }
  return entries.every((entry) => entry.assessment.level === null) ? 1 : 0;
}

function runObserve(options: CliOptions): number {
  const config = loadOperationalConfig(options);
  if (!options.site) {
    console.error("--site <id> is required for observe");
    return 1;
  }
  const site = config.sites.find((s) => s.id === options.site);
  if (!site) {
    console.error(`unknown site: ${options.site} (not in ${options.configPath})`);
    return 1;
  }
  const input = {
    siteId: site.id,
    date: options.date ?? todayISO(),
    score: options.score ?? null,
    bleachedPercent: options.bleached ?? null,
    depthM: options.depth ?? null,
    latitude: options.lat ?? null,
    longitude: options.lon ?? null,
    photo: options.photo ?? null,
    notes: options.notes ?? "",
  };
  const problems = validateObservationInput(input);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`problem: ${problem}`);
    }
    console.error(`${problems.length} problem(s); observation not saved`);
    return 1;
  }
  const observation = addObservation(config.dataDir, input);
  console.log(`wrote observation ${observation.id} to ${observationsPath(config.dataDir)}`);
  return 0;
}

function runExport(options: CliOptions): number {
  const config = loadOperationalConfig(options);
  const format = (options.format ?? "generic") as ExportFormat;
  if (!EXPORT_FORMATS.includes(format)) {
    console.error(`unknown format: ${format} (use: ${EXPORT_FORMATS.join(" | ")})`);
    return 1;
  }
  const observations = loadObservations(config.dataDir);
  if (observations.length === 0) {
    console.error("no observations to export");
    return 1;
  }
  const csv = observationsToCsv(observations, format);
  if (options.out) {
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, csv);
    console.log(`wrote ${options.out} (${observations.length} observation(s), format ${format})`);
  } else {
    process.stdout.write(csv);
  }
  return 0;
}

async function runNotify(options: CliOptions): Promise<number> {
  const config = loadOperationalConfig(options);
  const now = options.now ? parseNow(options.now) : new Date();
  const entries = await collectRiskEntries(config, options, now);
  const alerts = entries.filter((entry) => {
    const site = config.sites.find((s) => s.id === entry.siteId);
    const min = site?.minAlertLevel ?? DEFAULT_MIN_ALERT_LEVEL;
    return entry.assessment.level !== null && entry.assessment.level >= min;
  });
  if (alerts.length === 0) {
    console.log("no sites at or above their alert threshold");
    return 0;
  }
  const alert = buildAlert(alerts);
  if (alert === null) {
    console.log("no sites at or above their alert threshold");
    return 0;
  }
  if (options.dryRun) {
    console.log("would send alert via ntfy:");
    console.log(`Title: ${alert.title}`);
    console.log("");
    console.log(alert.message);
    return 0;
  }
  const topic = config.notify?.topic;
  if (!topic) {
    console.error("notify.topic is not set in the config");
    return 1;
  }
  await sendNtfy({
    server: config.notify?.server,
    topic,
    title: alert.title,
    message: alert.message,
  });
  console.log(`sent alert: ${alerts.length} site(s) to ${effectiveServer(config.notify?.server)}/${topic}`);
  return 0;
}

function runDemo(options: CliOptions): number {
  const now = options.now ? parseNow(options.now) : new Date();
  const entries = demoRiskEntries();
  if (options.json) {
    console.log(formatRiskJson(entries, now));
    return 0;
  }
  console.log(formatRiskText(entries, now));
  console.log("");
  console.log("Demo runs fully offline. The first site uses a captured snapshot (2026-10-15).");
  console.log("The second site uses synthetic values to show an alert state.");
  return 0;
}

export async function run(argv: string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error("run coralpulse --help for usage");
    return 1;
  }
  if (options.help || options.command === "help") {
    console.log(USAGE);
    return 0;
  }
  if (options.version) {
    console.log(packageVersion());
    return 0;
  }
  try {
    switch (options.command) {
      case "init":
        return runInit(options);
      case "validate":
        return runValidate(options);
      case "fetch":
        return await runFetch(options);
      case "risk":
        return await runRisk(options);
      case "observe":
        return runObserve(options);
      case "export":
        return runExport(options);
      case "notify":
        return await runNotify(options);
      case "demo":
        return runDemo(options);
      default:
        console.error(
          options.command === "" ? "no command given" : `unknown command: ${options.command}`,
        );
        console.error("run coralpulse --help for usage");
        return 1;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && fileURLToPath(import.meta.url).toLowerCase() === invokedPath.toLowerCase()) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}