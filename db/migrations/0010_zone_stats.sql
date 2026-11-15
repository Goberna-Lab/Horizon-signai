-- Precomputed 2026-2030 figures per candidate zone, computed by the planner's own engine (prototipos/lunar-map/engine.js,
-- run by prototipos/lunar-map/tools/zone-stats.js and stored by db/etl/load_zone_stats.py) for each standard gear height
-- (the panel heights of ref.power_system, with the antenna at the same height). step_s = 10800 gives the means the
-- planner shows in its zone cards (the ephemeris table step); step_s = 600 is the engine's 10-minute sweep.
CREATE TABLE IF NOT EXISTS moon.zone_stats (
  zone_id           integer NOT NULL REFERENCES moon.candidate_zone(id) ON DELETE CASCADE,
  panel_height_m    real NOT NULL CHECK (panel_height_m >= 0),
  antenna_height_m  real NOT NULL CHECK (antenna_height_m >= 0),
  step_s            integer NOT NULL CHECK (step_s > 0),
  period_start      timestamptz NOT NULL,
  period_end        timestamptz NOT NULL,
  samples           integer NOT NULL,
  sun_pct           real NOT NULL,
  earth_pct         real NOT NULL,
  both_pct          real NOT NULL,
  longest_night_h   real NOT NULL,
  longest_silence_h real NOT NULL,
  mean_panel_w_m2   real NOT NULL,
  engine_sha256     text NOT NULL,
  computed_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zone_id, panel_height_m, antenna_height_m, step_s)
);
COMMENT ON TABLE moon.zone_stats IS 'Planner engine figures over the whole ephemeris period, per zone and gear height (see db/README.md).';
COMMENT ON COLUMN moon.zone_stats.engine_sha256 IS 'sha256 of prototipos/lunar-map/engine.js used to compute the row.';

GRANT SELECT ON moon.zone_stats TO map_api_ro;
