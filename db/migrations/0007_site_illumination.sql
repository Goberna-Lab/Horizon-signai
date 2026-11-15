-- Precomputed Sun/Earth geometry for every site at every ephemeris timestamp (partitioned by year).
CREATE TABLE IF NOT EXISTS moon.site_illumination (
  site_id       integer NOT NULL REFERENCES moon.site(id) ON DELETE CASCADE,
  t             timestamptz NOT NULL,
  sun_az        real NOT NULL,
  sun_el        real NOT NULL,
  sun_lit       boolean NOT NULL,
  earth_az      real NOT NULL,
  earth_el      real NOT NULL,
  earth_visible boolean NOT NULL,
  PRIMARY KEY (site_id, t)
) PARTITION BY RANGE (t);

DO $$
DECLARE y int;
BEGIN
  -- 2031 holds the last ephemeris row (2031-01-01T00:00Z).
  FOR y IN 2026..2031 LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS moon.site_illumination_%s PARTITION OF moon.site_illumination
         FOR VALUES FROM (%L) TO (%L)',
      y, (y || '-01-01 00:00:00+00'), ((y + 1) || '-01-01 00:00:00+00'));
  END LOOP;
END $$;

-- Set-based refresh: all sites x all ephemeris timestamps, no row loops. The horizon of a site is its
-- horizon profile (when it has one) interpolated by azimuth, else 0 (the local horizontal plane).
CREATE OR REPLACE PROCEDURE moon.refresh_site_illumination()
LANGUAGE plpgsql AS $$
BEGIN
  TRUNCATE moon.site_illumination;
  INSERT INTO moon.site_illumination (site_id, t, sun_az, sun_el, sun_lit, earth_az, earth_el, earth_visible)
  WITH ser AS (SELECT id FROM eph.series ORDER BY id DESC LIMIT 1),
  sun AS (
    SELECT sm.t, sm.x, sm.y, sm.z FROM eph.sample sm
    JOIN ser ON sm.series_id = ser.id JOIN eph.body b ON b.id = sm.body_id AND b.name = 'sun'),
  earth AS (
    SELECT sm.t, sm.x, sm.y, sm.z FROM eph.sample sm
    JOIN ser ON sm.series_id = ser.id JOIN eph.body b ON b.id = sm.body_id AND b.name = 'earth'),
  prof AS (
    SELECT DISTINCT ON (site_id) site_id, elevation_deg FROM moon.horizon_profile ORDER BY site_id, id DESC)
  SELECT s.id, sun.t, sa.azimuth_deg, sa.elevation_deg,
         sa.elevation_deg > moon.interp_horizon(p.elevation_deg, sa.azimuth_deg),
         ea.azimuth_deg, ea.elevation_deg,
         ea.elevation_deg > moon.interp_horizon(p.elevation_deg, ea.azimuth_deg)
  FROM moon.site s
  CROSS JOIN sun
  JOIN earth ON earth.t = sun.t
  LEFT JOIN prof p ON p.site_id = s.id
  CROSS JOIN LATERAL moon.sky_angles(ST_Y(s.geom), s.lon_east, sun.x, sun.y, sun.z) sa
  CROSS JOIN LATERAL moon.sky_angles(ST_Y(s.geom), s.lon_east, earth.x, earth.y, earth.z) ea;
  ANALYZE moon.site_illumination;
END $$;
