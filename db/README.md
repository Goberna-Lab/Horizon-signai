# db/ - PostgreSQL + PostGIS for the 3D Moon map

Image `postgis/postgis:17-3.5` (PostGIS + postgis_raster + pg_trgm). Credentials come from the repo-root `.env`.

```bash
docker compose -f db/docker-compose.yml up -d          # host port 5433 (override: HORIZON_DB_PORT=5436)
pip install -r db/requirements.txt                     # psycopg 3, numpy (Pillow for the ETL image sizes)
python db/migrate.py                                   # applies db/migrations/*.sql, tracked in public.schema_migration
python db/etl/load_map3d.py                            # idempotent load from luna-recursos/datos + apps/web/scripts/mapa-3d
python db/etl/load_zones.py                            # the planner's 13 candidate zones (needs load_map3d first)
python db/etl/load_zone_stats.py                       # 2026-2030 figures per zone with the planner engine (needs node, ~40 s)
python -c "..."  # or psql: CALL moon.refresh_site_illumination();   (~1 min, set-based, 62 sites x 14609 times)
python db/etl/verify.py                                # counts, asset equality, elevation_at and sun_at spot checks
```
`DATABASE_URL` is used for host/user/password/db; `HORIZON_DB_PORT` / `HORIZON_DB_HOST` override port/host
(`localhost` is mapped to `127.0.0.1` to avoid a slow IPv6 attempt on Windows). `verify.py` compares against the
HTML that still embedded the data (`git show HEAD:apps/web/public/mapa-3d.html`, or `--html <file>`).

## Schemas
`ref` (country, agency, site_category, feature_type, data_source, dataset, provenance_note), `moon` (iau_feature,
site, site_link, site_terrain, horizon_profile, v_horizon_sample, site_illumination), `eph` (body, series, sample),
`terrain` (raster_tile, asset). Planner (0009): `moon.candidate_zone`, `moon.horizon_envelope`, `moon.v_candidate_zone`,
`ref.illumination_reference`, `ref.power_system`, `moon.zone_stats` (0010). English content only. Category codes: `crewed, robotic, sample_return, rover,
candidate, impact` (the old viewer used Spanish codes). Role `map_api_ro` (NOLOGIN): SELECT + EXECUTE only.

## SRIDs (registered in `spatial_ref_sys`)
- **910001** Moon geographic, sphere R = 1737400 m: `+proj=longlat +R=1737400 +no_defs`. Geometry longitudes are
  -180..180 (east positive); generated column `lon_east` is 0..360.
- **910002** Moon south polar stereographic: `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +R=1737400 +units=m`.
  Scale 1 at the pole, `x = rho*sin(lon)`, `y = rho*cos(lon)`, `rho = 2R*tan(c/2)`, c = angular distance from the
  pole (the same convention as the generator; PROJ reproduces it exactly).

## Raster georeference (terrain.raster_tile, tiles up to 256x256, edge tiles smaller)
- Global grids (`global_elevation` int16 m, `global_albedo` float32 reflectance, SRID 910001): pixel-is-area, 0.25 deg,
  upper-left corner (-180, 90). The source grid starts at 0E, so columns are rolled by 720; column 0 of the source
  (0E) is column 720. Assumption: LDEM_4/LDAM_4 pixels are area-registered (pixel 0 spans 0-0.25E, 90-89.75N).
  Albedo is stored as real reflectance (original float16 values); the viewer's uint8 form is in `terrain.asset`
  (`reflectance = 0.10 + v/255*0.50`).
- Pole grids (int16 m, SRID 910002): grid points are pixel centres. 240 m: first centre (-195000, 195000),
  1626x1626; 960 m: first centre (-339600, 339600), 708x708; 663 m (blend): first centre (-339000, 339000),
  1024x1024, pixel 662.7566 m. Upper-left corner = first centre -/+ half a pixel, y scale negative.
- `terrain.elevation_at(lat, lon)` returns the nearest pixel of the finest raster covering the point
  (240 m -> 663 m -> global); `lon` may be -180..180 or 0..360. `AddRasterConstraints` is not applied because one
  table holds datasets with different SRID and pixel type.

## terrain.asset
Exactly the bytes the viewer decodes today (zlib level 9 of row-delta int16 LE for elevations, zlib of uint8 albedo,
zlib of time-delta int16 ephemeris, raw webp / jpeg), with `sha256` and `byte_size`; stream them unchanged.

## Calculations
Ephemeris vectors are unit vectors Moon centre -> body in MOON_ME. `moon.sun_at / earth_at(site_slug, t)` give
azimuth (0 = north, clockwise), elevation and `above_horizon` against the site's horizon profile (interpolated by
azimuth; 0 when the site has none). Surface parallax is ignored (Earth: up to ~0.26 deg), as in the viewer;
`eph.sample.dist_km` is kept so it can be added later.

Planner candidate zones (migration 0009, `db/etl/load_zones.py`, source `prototipos/lunar-map/data/zonas.js`, the file the
planner reads): `moon.horizon_envelope` stores, per zone and azimuth (0.5 deg), the upper convex envelope of the terrain
(x, y in metres from the foot), so `moon.horizon_at(code, azimuth_deg, height_m)` gives the horizon from any height
(panel, antenna, raised gear) exactly as the planner engine does; the loader checks it against the engine to 1e-4 deg.
A-J have the detailed PGDA 5 m + LOLA horizon, K-M an approximate one on LOLA 240 m. `ref.illumination_reference` keeps
the Mazarico et al. (2011) mean visibility per zone (validation, not a verdict input); `ref.power_system` the panel
presets (lander 2 m, NASA VSAT 5 m and 10 m, vertical, single-axis tracking). Sources: `docs/referencias.md`.

`moon.zone_stats` (migration 0010, `db/etl/load_zone_stats.py`): per zone and gear height (the `ref.power_system`
heights, antenna = panel), the planner's figures over the whole ephemeris period (sun, earth, both %, longest night and
silence, mean panel W/m2), at step 10800 s (the means of the planner cards) and 600 s (the engine's sweep). They are
computed by the planner's own `prototipos/lunar-map/engine.js` (run with Node by `prototipos/lunar-map/tools/zone-stats.js`;
`engine_sha256` records which engine). The loader image installs `nodejs` for this.

API (`apps/api/src/planner/`, same engine, inputs from this database: `eph.sample`, `moon.horizon_envelope`):
`GET /api/planner/zones?height=2`, `GET /api/planner/power-systems`,
`GET /api/planner/evaluate?zone=C&landing=2026-12-18T09:00Z&stay=3&panel=2&antenna=2&battery=24&earth=40&sun=1&el=1`
(verdict, landing margins, stay figures and checks; the planner's rule).

## Production
`docker-compose.prod.yml` runs three services: `db` (PostGIS, volume `horizon_pgdata`, no published port), `db-loader`
(built from `db/Dockerfile`, build context = repo root, whitelist in `db/Dockerfile.dockerignore`) and the API in two
copies, `app-a` and `app-b` (zero-downtime deploy, `deploy/README.md`).

Server `/srv/horizon-signai/.env` must define (use URL-safe passwords: letters, digits, `-._~`; they are placed in a URL):
`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (owner role, used by `db` and `db-loader`) and `MAP_API_PASSWORD`
(login `map_api`, used by the API). `DATABASE_URL` and `HORIZON_DB_PORT` are only for local dev; compose sets them itself.

On every deploy (`.github/workflows/deploy.yml`): `db` starts -> `db-loader` runs (while the previous app version keeps serving), runs `migrate.py`, computes a
sha256 fingerprint of the ETL code, migrations and source data files, and compares it with `public.etl_run`. If it
changed (or the table is empty) it runs `load_map3d.py` + `load_zones.py` + `load_zone_stats.py` + `CALL moon.refresh_site_illumination()` (about
100 s) and records the new
fingerprint; otherwise it skips both. It then creates/updates the login role `map_api` (member of `map_api_ro`, SELECT +
EXECUTE only; password from `MAP_API_PASSWORD`, set idempotently, never stored in SQL files). The app copies are replaced
only after the loader exits 0 and connect as `map_api`. A loader failure stops the deploy before the app is touched.

**Migrations must work with the previous app version.** They run while the old version is still serving, and a rollback
puts the old image back on top of the migrated database. Add first (new table, nullable column); remove or rename in a
later deploy, once no running version reads the old shape.

Force a reload: `docker compose -f docker-compose.prod.yml run --rm -e FORCE_RELOAD=1 db-loader`
(or `DELETE FROM public.etl_run;`). Rotate the API password: change `MAP_API_PASSWORD`, then `up -d` (loader updates it).

Rough numbers (dev machine): first load ~55 s (ETL ~3 s + illumination refresh ~50 s), unchanged redeploy < 2 s
(loader), database ~140 MB, loader image ~360 MB.

Local API against the dev DB as the least-privilege role: after a loader/`ensure_api_role` run, use
`DATABASE_URL=postgres://map_api:<MAP_API_PASSWORD>@127.0.0.1:5436/<POSTGRES_DB>` for `apps/api` (the owner URL in `.env`
keeps working for migrations and the ETL).
