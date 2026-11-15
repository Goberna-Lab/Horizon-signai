-- Extensions, schemas, lunar spatial reference systems and roles.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS ref;
CREATE SCHEMA IF NOT EXISTS moon;
CREATE SCHEMA IF NOT EXISTS eph;
CREATE SCHEMA IF NOT EXISTS terrain;

-- 910001: Moon geographic coordinates on a sphere of R = 1737400 m (lon east positive, geometry lon in -180..180).
-- 910002: Moon south polar stereographic, scale 1 at the pole, x = rho*sin(lon), y = rho*cos(lon), rho = 2R*tan(c/2).
INSERT INTO spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) VALUES
  (910001, 'HORIZON', 910001, '', '+proj=longlat +R=1737400 +no_defs'),
  (910002, 'HORIZON', 910002, '', '+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs')
ON CONFLICT (srid) DO UPDATE SET proj4text = EXCLUDED.proj4text, auth_name = EXCLUDED.auth_name;

-- Read-only role for the API (grant it to a LOGIN role later).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'map_api_ro') THEN
    CREATE ROLE map_api_ro NOLOGIN;
  END IF;
END $$;
