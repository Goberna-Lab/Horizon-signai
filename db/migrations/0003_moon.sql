-- Moon features and landing sites. Geometry is lon/lat in SRID 910001 with lon in -180..180; lon_east is 0..360.
CREATE TABLE IF NOT EXISTS moon.iau_feature (
  id            integer PRIMARY KEY,            -- IAU/USGS Gazetteer id
  name          text NOT NULL,
  type_code     text NOT NULL REFERENCES ref.feature_type(code),
  diameter_km   real,
  origin        text,
  approval_year smallint,
  geom          geometry(Point, 910001) NOT NULL,
  lon_east      double precision GENERATED ALWAYS AS
                (CASE WHEN ST_X(geom) < 0 THEN ST_X(geom) + 360 ELSE ST_X(geom) END) STORED
);
CREATE INDEX IF NOT EXISTS iau_feature_geom_gix ON moon.iau_feature USING gist (geom);
CREATE INDEX IF NOT EXISTS iau_feature_name_trgm ON moon.iau_feature USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS iau_feature_type_idx ON moon.iau_feature (type_code);

CREATE TABLE IF NOT EXISTS moon.site (
  id                   serial PRIMARY KEY,
  slug                 text NOT NULL UNIQUE,
  name                 text NOT NULL,
  category_code        text NOT NULL REFERENCES ref.site_category(code),
  agency_id            integer NOT NULL REFERENCES ref.agency(id),
  event_date           date,
  geom                 geometry(Point, 910001) NOT NULL,
  lon_east             double precision GENERATED ALWAYS AS
                       (CASE WHEN ST_X(geom) < 0 THEN ST_X(geom) + 360 ELSE ST_X(geom) END) STORED,
  region_name          text,
  region_feature_id    integer REFERENCES moon.iau_feature(id),
  source_id            integer REFERENCES ref.data_source(id),
  description          text,
  is_approximate       boolean NOT NULL DEFAULT false,
  is_artemis_candidate boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS site_geom_gix ON moon.site USING gist (geom);
CREATE INDEX IF NOT EXISTS site_category_idx ON moon.site (category_code);

CREATE TABLE IF NOT EXISTS moon.site_link (
  id         serial PRIMARY KEY,
  site_id    integer NOT NULL REFERENCES moon.site(id) ON DELETE CASCADE,
  label      text NOT NULL,
  url        text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  UNIQUE (site_id, sort_order)
);

CREATE TABLE IF NOT EXISTS moon.site_terrain (
  site_id     integer NOT NULL REFERENCES moon.site(id) ON DELETE CASCADE,
  dataset_id  integer NOT NULL REFERENCES ref.dataset(id),
  elevation_m real NOT NULL,
  slope_deg   real NOT NULL,
  PRIMARY KEY (site_id, dataset_id)
);

-- Terrain skyline elevation per azimuth; azimuth 0 = north, clockwise (east = 90).
CREATE TABLE IF NOT EXISTS moon.horizon_profile (
  id            serial PRIMARY KEY,
  site_id       integer NOT NULL REFERENCES moon.site(id) ON DELETE CASCADE,
  dataset_id    integer NOT NULL REFERENCES ref.dataset(id),
  az_step_deg   real NOT NULL CHECK (az_step_deg > 0),
  elevation_deg real[] NOT NULL,
  UNIQUE (site_id, dataset_id),
  CONSTRAINT horizon_profile_len CHECK (cardinality(elevation_deg) = round(360 / az_step_deg)::int)
);

CREATE OR REPLACE VIEW moon.v_horizon_sample AS
SELECT s.slug AS site_slug,
       ((u.ord - 1) * hp.az_step_deg)::real AS azimuth_deg,
       u.elev AS elevation_deg
FROM moon.horizon_profile hp
JOIN moon.site s ON s.id = hp.site_id
CROSS JOIN LATERAL unnest(hp.elevation_deg) WITH ORDINALITY AS u(elev, ord);
