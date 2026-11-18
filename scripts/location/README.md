# Location Intelligence Open-Data Importers

All scripts connect strictly to `.env.local` via `scripts/db/_lib.mjs`, perform **zero live scraping**, and support `--dry-run`.

## 1. Florida Highway On-Ramps (Geofabrik OSM Florida)
Download `florida-latest.osm.pbf` from Geofabrik (`https://download.geofabrik.de/north-america/us/florida.html`), extract `highway=motorway_junction` points to GeoJSON (`ogr2ogr -f GeoJSON fl-junctions.geojson florida-latest.osm.pbf points -where "highway='motorway_junction'"`), then run:

```bash
node scripts/location/import-osm-junctions.mjs --file data/location/fl-junctions.geojson
```

## 2. School Attendance Boundaries & FLDOE School Grades
- **Palm Beach County GIS**: Export Elementary / Middle / High attendance boundary GeoJSON layers from School District of Palm Beach County Open Data.
- **Broward County GIS**: Export Elementary / Middle / High attendance boundary GeoJSON layers from Broward County Public Schools GeoHub.
- **FLDOE School Grades**: Download the annual School Grades CSV from `https://www.fldoe.org/accountability/accountability-reporting/school-grades/`.

```bash
node scripts/location/import-schools-and-grades.mjs \
  --boundaries data/location/pbc-elementary.geojson --county "Palm Beach" --level elementary --year "2025-2026"

node scripts/location/import-schools-and-grades.mjs \
  --grades data/location/SchoolGrades26.csv --year "2025-2026"
```

## 3. FDLE Agency Offense Statistics
Download the official FDLE County and Municipal Offense Summary CSV from `https://www.fdle.state.fl.us/CJAB/UCR/Annual-Reports` and run:

```bash
node scripts/location/import-fdle-ucr.mjs --file data/location/fdle-agency-summary.csv --year 2025
```
