-- Reference data: countries, agencies, categories, IAU feature types, data sources, datasets, provenance notes.
CREATE TABLE IF NOT EXISTS ref.country (
  code text PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS ref.agency (
  id           serial PRIMARY KEY,
  name         text NOT NULL UNIQUE,
  country_code text NOT NULL REFERENCES ref.country(code)
);
CREATE TABLE IF NOT EXISTS ref.site_category (
  code           text PRIMARY KEY,
  label          text NOT NULL,
  label_singular text NOT NULL,
  sort_order     smallint NOT NULL
);
CREATE TABLE IF NOT EXISTS ref.feature_type (
  code text PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS ref.data_source (
  id       serial PRIMARY KEY,
  key      text NOT NULL UNIQUE,
  citation text NOT NULL,
  url      text
);
CREATE TABLE IF NOT EXISTS ref.dataset (
  id           serial PRIMARY KEY,
  key          text NOT NULL UNIQUE,
  source_id    integer REFERENCES ref.data_source(id),
  description  text NOT NULL,
  resolution_m double precision,
  srid         integer,
  width        integer,
  height       integer,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS ref.provenance_note (
  key  text PRIMARY KEY,
  body text NOT NULL
);
