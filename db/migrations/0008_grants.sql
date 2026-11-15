-- Read-only access for the API role (map_api_ro, NOLOGIN: grant it to an API login role later).
GRANT USAGE ON SCHEMA ref, moon, eph, terrain TO map_api_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA ref, moon, eph, terrain TO map_api_ro;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA moon, eph, terrain TO map_api_ro;
-- Objects created later by the owner are readable too.
ALTER DEFAULT PRIVILEGES IN SCHEMA ref, moon, eph, terrain GRANT SELECT ON TABLES TO map_api_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA moon, eph, terrain GRANT EXECUTE ON FUNCTIONS TO map_api_ro;
-- The PostGIS raster/geometry functions live in public.
GRANT USAGE ON SCHEMA public TO map_api_ro;
GRANT SELECT ON spatial_ref_sys, geometry_columns, geography_columns, raster_columns, raster_overviews TO map_api_ro;
