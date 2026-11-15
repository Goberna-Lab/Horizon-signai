-- Calculation functions. Frame conventions:
--   eph vectors are unit vectors Moon centre -> body in MOON_ME (x toward 0N 0E, y toward 0N 90E, z toward the north pole).
--   Local frame at a site (lat, lon east): east, north, up; azimuth 0 = north, clockwise; elevation above the local horizontal plane.
--   Parallax (observer on the surface vs Moon centre) is ignored, like the viewer does (<= 0.26 deg for Earth).

-- Azimuth/elevation of direction (x,y,z) seen from a point on the sphere.
CREATE OR REPLACE FUNCTION moon.sky_angles(
  lat_deg double precision, lon_east_deg double precision,
  x double precision, y double precision, z double precision,
  OUT azimuth_deg double precision, OUT elevation_deg double precision)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN atan2(e, n) < 0 THEN degrees(atan2(e, n)) + 360.0 ELSE degrees(atan2(e, n)) END,
         degrees(asin(greatest(-1.0, least(1.0, u / sqrt(x * x + y * y + z * z)))))
  FROM (
    SELECT -x * sin(radians(lon_east_deg)) + y * cos(radians(lon_east_deg)) AS e,
           -sin(radians(lat_deg)) * (x * cos(radians(lon_east_deg)) + y * sin(radians(lon_east_deg))) + z * cos(radians(lat_deg)) AS n,
           cos(radians(lat_deg)) * (x * cos(radians(lon_east_deg)) + y * sin(radians(lon_east_deg))) + z * sin(radians(lat_deg)) AS u
  ) q
$$;

-- Linear interpolation of a horizon profile (array indexed from azimuth 0, circular) at azimuth az; 0 when no profile.
CREATE OR REPLACE FUNCTION moon.interp_horizon(arr real[], az double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN arr IS NULL THEN 0::double precision
              ELSE arr[(k % n) + 1] * (1 - f) + arr[((k + 1) % n) + 1] * f END
  FROM (
    SELECT cardinality(arr) AS n,
           floor(az * cardinality(arr) / 360.0)::int AS k,
           az * cardinality(arr) / 360.0 - floor(az * cardinality(arr) / 360.0) AS f
  ) q
$$;

-- Unit vector of a body at time t: linear interpolation between the two bracketing samples, renormalised.
-- Returns no row when t is outside the ephemeris table.
CREATE OR REPLACE FUNCTION eph.position_at(body text, t timestamptz)
RETURNS TABLE (x double precision, y double precision, z double precision)
LANGUAGE sql STABLE AS $$
  WITH ser AS (SELECT id FROM eph.series ORDER BY id DESC LIMIT 1),
  b AS (SELECT id FROM eph.body WHERE name = position_at.body),
  lo AS (
    SELECT sm.t, sm.x, sm.y, sm.z FROM eph.sample sm, ser, b
    WHERE sm.series_id = ser.id AND sm.body_id = b.id AND sm.t <= position_at.t
    ORDER BY sm.t DESC LIMIT 1),
  hi AS (
    SELECT sm.t, sm.x, sm.y, sm.z FROM eph.sample sm, ser, b
    WHERE sm.series_id = ser.id AND sm.body_id = b.id AND sm.t >= position_at.t
    ORDER BY sm.t ASC LIMIT 1),
  w AS (
    SELECT lo.x AS x0, lo.y AS y0, lo.z AS z0, hi.x AS x1, hi.y AS y1, hi.z AS z1,
           CASE WHEN hi.t = lo.t THEN 0::double precision
                ELSE extract(epoch FROM position_at.t - lo.t) / extract(epoch FROM hi.t - lo.t) END AS f
    FROM lo, hi),
  v AS (
    SELECT x0 + (x1 - x0) * f AS x, y0 + (y1 - y0) * f AS y, z0 + (z1 - z0) * f AS z FROM w)
  SELECT v.x / m, v.y / m, v.z / m FROM v, LATERAL (SELECT sqrt(v.x * v.x + v.y * v.y + v.z * v.z) AS m) q
$$;

-- Shared worker: azimuth, elevation and visibility (above the site's terrain horizon, if any) of a body.
CREATE OR REPLACE FUNCTION moon.body_at(body text, site_slug text, t timestamptz)
RETURNS TABLE (azimuth_deg double precision, elevation_deg double precision, above_horizon boolean)
LANGUAGE sql STABLE AS $$
  SELECT sa.azimuth_deg, sa.elevation_deg,
         sa.elevation_deg > moon.interp_horizon(hp.elevation_deg, sa.azimuth_deg)
  FROM moon.site s
  CROSS JOIN LATERAL eph.position_at(body_at.body, body_at.t) p
  CROSS JOIN LATERAL moon.sky_angles(ST_Y(s.geom), s.lon_east, p.x, p.y, p.z) sa
  LEFT JOIN LATERAL (
    SELECT elevation_deg FROM moon.horizon_profile h WHERE h.site_id = s.id ORDER BY h.id DESC LIMIT 1
  ) hp ON true
  WHERE s.slug = body_at.site_slug
$$;

CREATE OR REPLACE FUNCTION moon.sun_at(site_slug text, t timestamptz)
RETURNS TABLE (azimuth_deg double precision, elevation_deg double precision, above_horizon boolean)
LANGUAGE sql STABLE AS $$ SELECT * FROM moon.body_at('sun', sun_at.site_slug, sun_at.t) $$;

CREATE OR REPLACE FUNCTION moon.earth_at(site_slug text, t timestamptz)
RETURNS TABLE (azimuth_deg double precision, elevation_deg double precision, above_horizon boolean)
LANGUAGE sql STABLE AS $$ SELECT * FROM moon.body_at('earth', earth_at.site_slug, earth_at.t) $$;

-- Elevation (m above the 1737.4 km sphere) at a point: finest raster covering it (240 m -> 663 m -> global).
-- Nearest pixel; lon may be given as -180..180 or 0..360.
CREATE OR REPLACE FUNCTION terrain.elevation_at(lat double precision, lon double precision)
RETURNS double precision LANGUAGE sql STABLE
SET client_min_messages = error  -- a point on a tile border makes ST_Value of the neighbour tile emit a NOTICE
AS $$
  WITH p AS (
    SELECT ST_SetSRID(ST_MakePoint(
             least(179.999999, elevation_at.lon - 360.0 * floor((elevation_at.lon + 180.0) / 360.0)),
             elevation_at.lat), 910001) AS g
  ),
  pp AS (SELECT ST_Transform(p.g, 910002) AS g FROM p WHERE elevation_at.lat < -70)
  SELECT v FROM (
    SELECT 1 AS pri, ST_Value(rt.rast, 1, pp.g) AS v
      FROM terrain.raster_tile rt, pp
      WHERE rt.dataset_id = (SELECT id FROM ref.dataset WHERE key = 'pole_elevation_240')
        AND ST_ConvexHull(rt.rast) && pp.g
    UNION ALL
    SELECT 2, ST_Value(rt.rast, 1, pp.g)
      FROM terrain.raster_tile rt, pp
      WHERE rt.dataset_id = (SELECT id FROM ref.dataset WHERE key = 'pole_elevation_663')
        AND ST_ConvexHull(rt.rast) && pp.g
    UNION ALL
    SELECT 3, ST_Value(rt.rast, 1, p.g)
      FROM terrain.raster_tile rt, p
      WHERE rt.dataset_id = (SELECT id FROM ref.dataset WHERE key = 'global_elevation')
        AND ST_ConvexHull(rt.rast) && p.g
  ) q
  WHERE v IS NOT NULL
  ORDER BY pri
  LIMIT 1
$$;
