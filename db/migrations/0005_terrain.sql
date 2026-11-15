-- Terrain: tiled PostGIS rasters (for calculations) and byte-exact encoded assets (for streaming to the viewer).
-- One table holds all datasets (different SRID / pixel type), so AddRasterConstraints is NOT applied table-wide;
-- every tile of a dataset shares srid, scale and pixel type by construction (see db/README.md).
CREATE TABLE IF NOT EXISTS terrain.raster_tile (
  id         serial PRIMARY KEY,
  dataset_id integer NOT NULL REFERENCES ref.dataset(id) ON DELETE CASCADE,
  rast       raster NOT NULL
);
CREATE INDEX IF NOT EXISTS raster_tile_dataset_idx ON terrain.raster_tile (dataset_id);
CREATE INDEX IF NOT EXISTS raster_tile_hull_gix ON terrain.raster_tile USING gist (ST_ConvexHull(rast));

CREATE TABLE IF NOT EXISTS terrain.asset (
  dataset_id integer NOT NULL REFERENCES ref.dataset(id) ON DELETE CASCADE,
  format     text NOT NULL,
  encoding   text NOT NULL,
  content    bytea NOT NULL,
  sha256     text NOT NULL,
  byte_size  integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset_id, format)
);
