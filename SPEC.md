# coralpulse — SPEC (v0.1)

Bleaching early-warning companion for reef communities, dive operators, and schools.
It shows heat-stress risk for local reefs from free NOAA satellite data.
It logs simple field observations. It exports them for global reef databases.

Build date: 2026-10-20. Build harness: DSH (spec-first).

## Goals

- Show the current bleaching alert level for each configured reef site.
- Explain the level in plain language. Suggest actions.
- Log field observations in a simple, offline-friendly format.
- Export observations for CoralWatch and MERMAID workflows.
- Send alert notifications through ntfy when a site heats up.
- Use free data. No API keys. No runtime dependencies.

## Non-goals (v1)

- Interactive map UI. The CLI prints text and JSON.
- Photo EXIF GPS parsing. Accept manual coordinates. EXIF support comes later.
- Direct upload to global databases. We export files. The user uploads.
- Allen Coral Atlas habitat layers. A manual note field exists instead.

## Data sources (verified 2026-10-20)

NOAA Coral Reef Watch 5 km daily products, served by CoastWatch ERDDAP.

- Base URL: `https://coastwatch.noaa.gov/erddap`
- Datasets and variables:
  - `noaacrwdhwDaily` — `degree_heating_week` (°C-weeks)
  - `noaacrwsstDaily` — `analysed_sst` (°C)
  - `noaacrwsstanomalyDaily` — `sea_surface_temperature_anomaly` (°C)
  - `noaacrwhotspotDaily` — `hotspot` (°C)
  - `noaacrwbaa7dDaily` — `bleaching_alert_area` (byte level)
- Point query: `/griddap/{dataset}.csv?{var}[(last)][(lat)][(lon)]`
- The server returns the nearest grid cell. The response has two header rows.
- Data lag: about one to four days. Show the data date in every report.

## Alert levels

The tool maps the `bleaching_alert_area` byte to labels:

| Byte | Label |
| ---- | ----- |
| 0 | No Stress |
| 1 | Watch |
| 2 | Warning |
| 3 | Alert Level 1 |
| 4 | Alert Level 2 |
| 5 | Alert Level 3+ |

Supporting values: hotspot, degree heating weeks, SST anomaly.

## Commands

- `coralpulse init` — write a template coralpulse.json.
- `coralpulse validate` — check the config. Print errors and warnings.
- `coralpulse fetch` — download the latest CRW values for each site into the cache.
- `coralpulse risk` — show the current risk per site. Use the cache when it is fresh.
- `coralpulse observe` — add a field observation.
- `coralpulse export` — write observations as CSV (coralwatch, mermaid, or generic).
- `coralpulse notify` — send alert notifications for sites at or above their threshold.
- `coralpulse demo` — run offline with bundled sample data.

## Observation model

Fields: id, siteId, date (YYYY-MM-DD), score (CoralWatch colour score 1-6, optional),
bleachedPercent (0-100, optional), depthM (optional), notes (optional),
latitude and longitude (optional), photo (path, optional), createdAt.

At least one of score or bleachedPercent must be present in each observation.

## Acceptance criteria

- `npm run build` passes with TypeScript strict. No runtime dependencies.
- `npm test` passes. Tests use `node:test` via `node --test "dist/test/**/*.test.js"`.
- `fetch` and `risk` work against the live ERDDAP service for a real reef site.
- `demo` works with no network.
- `export` writes valid CSV with documented headers.
- README shows install, build, and usage. Examples ship in `examples/`.
- Node >= 20.