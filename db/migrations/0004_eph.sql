-- Ephemerides: unit vectors from the Moon centre to the Sun/Earth in the MOON_ME body-fixed frame.
CREATE TABLE IF NOT EXISTS eph.body (
  id   smallint PRIMARY KEY,
  name text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS eph.series (
  id         serial PRIMARY KEY,
  source_id  integer REFERENCES ref.data_source(id),
  frame      text NOT NULL,
  step_s     integer NOT NULL,
  start_utc  timestamptz NOT NULL,
  row_count  integer NOT NULL
);
CREATE TABLE IF NOT EXISTS eph.sample (
  series_id integer  NOT NULL REFERENCES eph.series(id) ON DELETE CASCADE,
  body_id   smallint NOT NULL REFERENCES eph.body(id),
  t         timestamptz NOT NULL,
  x         real NOT NULL,
  y         real NOT NULL,
  z         real NOT NULL,
  dist_km   real,            -- Moon-centre to body distance (extra column, not used by the viewer)
  PRIMARY KEY (series_id, body_id, t)
);
CREATE INDEX IF NOT EXISTS sample_t_brin ON eph.sample USING brin (t);
