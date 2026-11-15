-- Planner candidate zones: the 13 south-pole candidates of the Mission log as the planner evaluates them (A-C are the
-- Barker et al. 2021 RoIs inside three sites; D-M are site centres), with the horizon envelope that gives the horizon
-- from ANY height (panel, antenna, raised gear), the reference illumination of Mazarico et al. (2011) and the solar
-- power-system presets (NASA VSAT). Loaded by db/etl/load_zones.py from prototipos/lunar-map/data/zonas.js, the same
-- file the planner reads, so the database and the planner compute the same horizon.

CREATE TABLE IF NOT EXISTS moon.candidate_zone (
  id                serial PRIMARY KEY,
  code              text NOT NULL UNIQUE CHECK (code ~ '^[A-Z]$'),
  slug              text NOT NULL UNIQUE,
  name              text NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('roi', 'site')),
  site_id           integer REFERENCES moon.site(id) ON DELETE SET NULL,
  geom              geometry(Point, 910001) NOT NULL,
  lon_east          double precision GENERATED ALWAYS AS
                    (CASE WHEN ST_X(geom) < 0 THEN ST_X(geom) + 360 ELSE ST_X(geom) END) STORED,
  horizon_quality   text NOT NULL CHECK (horizon_quality IN ('detailed', 'approximate')),
  horizon_source_id integer REFERENCES ref.data_source(id),
  ground_height_m   real,
  sort_order        smallint NOT NULL
);
CREATE INDEX IF NOT EXISTS candidate_zone_geom_gix ON moon.candidate_zone USING gist (geom);
COMMENT ON TABLE moon.candidate_zone IS 'The planner''s candidate landing zones (the 13 south-pole candidates of the Mission log).';
COMMENT ON COLUMN moon.candidate_zone.kind IS 'roi = a region of interest inside a site (Barker et al. 2021); site = the site centre.';
COMMENT ON COLUMN moon.candidate_zone.horizon_quality IS 'detailed = PGDA 5 m DTM up to 4 km + LOLA 240/960 m up to 150 km; approximate = LOLA 240 m only (terrain under ~500 m does not appear).';
COMMENT ON COLUMN moon.candidate_zone.ground_height_m IS 'Ground height at the zone over the 1737.4 km sphere (LOLA), when known.';

-- Upper convex envelope of the terrain along each azimuth, from the foot of the zone: x (m, horizontal distance) and
-- y (m, height over the ground at the foot). The horizon from a height H is max atan2(y - H, x) (mascara.ts).
CREATE TABLE IF NOT EXISTS moon.horizon_envelope (
  zone_id     integer NOT NULL REFERENCES moon.candidate_zone(id) ON DELETE CASCADE,
  az_index    smallint NOT NULL CHECK (az_index >= 0),
  az_step_deg real NOT NULL CHECK (az_step_deg > 0),
  hull_m      double precision[] NOT NULL CHECK (cardinality(hull_m) >= 2 AND cardinality(hull_m) % 2 = 0),
  PRIMARY KEY (zone_id, az_index)
);
COMMENT ON COLUMN moon.horizon_envelope.hull_m IS 'x0, y0, x1, y1, ... in metres; azimuth = az_index * az_step_deg, clockwise from north.';

-- Mazarico et al. (2011) mean visibility at ground level (LOLA 60 m DEM), the pixel of the zone: reference to check
-- the planner's own 2026-2030 means, not an input to the verdict.
CREATE TABLE IF NOT EXISTS ref.illumination_reference (
  zone_id       integer PRIMARY KEY REFERENCES moon.candidate_zone(id) ON DELETE CASCADE,
  source_id     integer REFERENCES ref.data_source(id),
  sun_product   text NOT NULL,
  earth_product text NOT NULL,
  pixel_row     integer,
  pixel_col     integer,
  sun_pct       real NOT NULL CHECK (sun_pct BETWEEN 0 AND 100),
  earth_pct     real NOT NULL CHECK (earth_pct BETWEEN 0 AND 100)
);

-- Solar power-system presets: how the panel is mounted and how it follows the Sun. The planner's irradiance model is a
-- vertical panel turning in azimuth to face the Sun: E = solar_constant / r^2 x visible disc x cos(Sun elevation).
CREATE TABLE IF NOT EXISTS ref.power_system (
  code                  text PRIMARY KEY,
  name                  text NOT NULL,
  orientation           text NOT NULL CHECK (orientation IN ('vertical', 'horizontal')),
  tracking              text NOT NULL CHECK (tracking IN ('none', 'azimuth', 'two_axis')),
  array_bottom_height_m real NOT NULL CHECK (array_bottom_height_m >= 0),
  solar_constant_w_m2   real NOT NULL DEFAULT 1361,
  source_id             integer REFERENCES ref.data_source(id),
  notes                 text
);

-- Horizon elevation (degrees) seen from height_m above the ground of a zone, azimuth clockwise from north: the envelope
-- at the two nearest azimuth samples, linearly interpolated (perfil + horizonteEn of the planner engine). The eye is at
-- least 1 cm above the ground, as in the engine.
CREATE OR REPLACE FUNCTION moon.horizon_at(zone_code text, azimuth_deg double precision, height_m double precision DEFAULT 2)
RETURNS double precision LANGUAGE sql STABLE AS $$
  WITH z AS (
    SELECT e.zone_id, e.az_step_deg AS step, count(*) AS n
    FROM moon.horizon_envelope e JOIN moon.candidate_zone c ON c.id = e.zone_id
    WHERE c.code = upper(zone_code)
    GROUP BY e.zone_id, e.az_step_deg
  ), pos AS (
    SELECT zone_id, n, (azimuth_deg - 360 * floor(azimuth_deg / 360)) / step AS a FROM z
  ), idx AS (
    SELECT zone_id, (floor(a)::int % n)::smallint AS i0, ((floor(a)::int + 1) % n)::smallint AS i1, a - floor(a) AS f FROM pos
  ), el AS (
    SELECT e.az_index, max(atan2(e.hull_m[2 * k] - greatest(height_m, 0.01), e.hull_m[2 * k - 1])) AS rad
    FROM idx JOIN moon.horizon_envelope e ON e.zone_id = idx.zone_id AND e.az_index IN (idx.i0, idx.i1)
    CROSS JOIN LATERAL generate_series(1, cardinality(e.hull_m) / 2) AS k
    GROUP BY e.az_index
  )
  SELECT degrees((SELECT rad FROM el WHERE az_index = idx.i0) * (1 - idx.f) + (SELECT rad FROM el WHERE az_index = idx.i1) * idx.f)
  FROM idx;
$$;

-- One row per zone, ready to read: position, Mission log site and the reference illumination.
CREATE OR REPLACE VIEW moon.v_candidate_zone AS
SELECT c.code, c.slug, c.name, c.kind, ST_Y(c.geom) AS lat, c.lon_east AS lon, s.slug AS site_slug, c.horizon_quality,
       ds.key AS horizon_source, c.ground_height_m, ir.sun_pct AS mazarico_sun_pct, ir.earth_pct AS mazarico_earth_pct, c.sort_order
FROM moon.candidate_zone c
LEFT JOIN moon.site s ON s.id = c.site_id
LEFT JOIN ref.data_source ds ON ds.id = c.horizon_source_id
LEFT JOIN ref.illumination_reference ir ON ir.zone_id = c.id;

GRANT SELECT ON moon.candidate_zone, moon.horizon_envelope, moon.v_candidate_zone, ref.illumination_reference, ref.power_system TO map_api_ro;
GRANT EXECUTE ON FUNCTION moon.horizon_at(text, double precision, double precision) TO map_api_ro;
