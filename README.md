# coralpulse

A bleaching early-warning companion for reef communities, dive operators, and schools.
It shows heat-stress risk for local reefs from free NOAA satellite data.
It logs field observations and exports them for global reef databases.

No API keys. No runtime dependencies. Runs offline after one fetch, or with `demo`.

## What it does

- Reads the NOAA Coral Reef Watch 5 km daily products from the CoastWatch ERDDAP service.
- Shows the current bleaching alert level for each reef site.
- Explains the level in plain language and suggests next actions.
- Logs field observations in an append-only JSONL file.
- Exports observations as CSV for CoralWatch and MERMAID workflows.
- Sends alert messages through ntfy when a site heats up.

## Requirements

- Node.js 20 or later.
- No API keys. The data services are free and open.

## Install and build

```sh
npm install
npm run build
npm test
```

Use the CLI from the repository:

```sh
node dist/src/cli.js --help
```

Or install the command globally:

```sh
npm install -g .
coralpulse --help
```

## Quick start

```sh
node dist/src/cli.js init       # writes a template coralpulse.json
node dist/src/cli.js validate   # checks the config
node dist/src/cli.js fetch      # downloads the latest values for each site
node dist/src/cli.js risk       # prints the risk report
```

Edit `coralpulse.json` first. Set each site's `id`, `name`, `latitude`, and `longitude`.
The `minAlertLevel` field sets the alert threshold for `notify`. The default is 3.

## Example report

```
coralpulse risk report — 1 site — 2026-10-19T19:12:13.070Z

Davies Reef, Great Barrier Reef (davies-reef)
  Level: No Stress (0)
  No heat stress. Conditions are normal for this reef.
  Data date: 2026-10-15T12:00:00Z (4 days old)
  Values: SST 25.5 °C · Anomaly -0.1 °C · HotSpot -3.0 °C · DHW 0.0 °C-weeks · BAA 0
  Next actions:
   - Keep observing on your normal schedule.
   - Log observations to build a local baseline.

Source: NOAA Coral Reef Watch 5 km daily products via CoastWatch ERDDAP.
Satellite data lags about one to four days. Treat levels as guidance, not proof.
```

Add `--json` for machine-readable output.

## Commands

### init

Writes a template `coralpulse.json`. Refuses to overwrite without `--force`.

### validate

Checks the config file. Prints problems and warnings.

### fetch

Downloads the five CRW values for each site into `data/cache/<site>.json`.

### risk

Shows the current risk. Uses the cache when it is fresh (within `risk.cacheHours`, default 12).
Use `--offline` to skip the network. Add `--json` for JSON output.

### observe

Adds a field observation.

```sh
node dist/src/cli.js observe --site davies-reef --score 2 --notes "pale tips on staghorn"
node dist/src/cli.js observe --site davies-reef --bleached 40 --depth 4 --lat -18.28 --lon 147.69 --photo photos/reef.jpg
```

Provide `--score` (CoralWatch colour score 1-6) or `--bleached` (percent 0-100).
At least one is required. The date defaults to today.

### export

Writes observations as CSV.

```sh
node dist/src/cli.js export --format generic
node dist/src/cli.js export --format coralwatch --out reef-coralwatch.csv
node dist/src/cli.js export --format mermaid
```

Column sets:

- `generic`: id, site_id, date, score, bleached_percent, depth_m, latitude, longitude, photo, notes, created_at
- `coralwatch`: date, site, latitude, longitude, depth_m, colour_score, bleached_percent, notes
- `mermaid`: site_id, date, latitude, longitude, depth_m, bleached_percent, notes

Check the current upload templates of CoralWatch and MERMAID before sending a file.

### notify

Sends ntfy alerts for sites at or above their threshold.

```sh
node dist/src/cli.js notify --dry-run   # prints the message, sends nothing
node dist/src/cli.js notify             # sends through ntfy
```

Set `notify.topic` in the config first. `notify.server` defaults to `https://ntfy.sh`.

### demo

Runs fully offline with bundled sample data.
One captured snapshot plus one synthetic example.

```sh
node dist/src/cli.js demo
node dist/src/cli.js demo --json
```

## Data source

- CoastWatch ERDDAP: `https://coastwatch.noaa.gov/erddap`
- Products: `noaacrwsstDaily`, `noaacrwsstanomalyDaily`, `noaacrwhotspotDaily`, `noaacrwdhwDaily`, `noaacrwbaa7dDaily`.
- The point query returns the nearest grid cell for the site coordinates.
- Satellite data lags about one to four days.

Alert level mapping:

| BAA byte | Label         |
| -------- | ------------- |
| 0        | No Stress     |
| 1        | Watch         |
| 2        | Warning       |
| 3        | Alert Level 1 |
| 4        | Alert Level 2 |
| 5+       | Alert Level 3+ |

If the BAA byte is missing, the tool estimates the level from DHW and HotSpot.
The report marks an estimate with `[estimated]`.

## Scheduled checks

Run `fetch` and `notify` from cron or a scheduler. Example, daily at 07:00:

```sh
node dist/src/cli.js fetch && node dist/src/cli.js notify
```

## Files

- `coralpulse.json` — config
- `data/cache/<site>.json` — latest satellite snapshot per site
- `data/observations.jsonl` — append-only observation log

The `data/` directory and `coralpulse.json` are gitignored.

## Status

v0.1.0. The specification is in SPEC.md. Built spec-first.

## License

MIT