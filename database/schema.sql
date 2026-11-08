-- Atalaya: esquema para Neon (PostgreSQL + PostGIS).
-- Lo usa el backend cuando DATABASE_URL está definido (backend/.env).
-- Se aplica con `npm run db:schema` (o pegándolo en el SQL Editor de Neon). Es idempotente.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Municipios (o veredas). El polígono sale del GeoJSON de IGAC/DANE.
CREATE TABLE IF NOT EXISTS zone (
  id         TEXT PRIMARY KEY,                 -- ej. 'pasto'
  name       TEXT NOT NULL,
  divipola   INTEGER UNIQUE,                   -- código DANE del municipio
  centroid   GEOGRAPHY(Point, 4326) NOT NULL,
  boundary   GEOGRAPHY(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS zone_boundary_gix ON zone USING GIST (boundary);
-- Otros nombres del municipio ("Tumaco", "Magüí Payán") para reconocerlo en noticias y datasets.
ALTER TABLE zone ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

-- Clima más reciente por zona (Open-Meteo).
CREATE TABLE IF NOT EXISTS weather_snapshot (
  id                BIGSERIAL PRIMARY KEY,
  zone_id           TEXT NOT NULL REFERENCES zone(id),
  temperature_c     REAL NOT NULL,
  humidity_pct      REAL NOT NULL,
  wind_kmh          REAL NOT NULL,
  days_without_rain INTEGER NOT NULL,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS weather_zone_time_idx ON weather_snapshot (zone_id, captured_at DESC);

-- Incendios históricos (scraping de noticias + datos abiertos UNGRD).
CREATE TABLE IF NOT EXISTS fire_event (
  id         BIGSERIAL PRIMARY KEY,
  zone_id    TEXT NOT NULL REFERENCES zone(id),
  place      TEXT NOT NULL,
  event_date DATE NOT NULL,
  hectares   REAL NOT NULL DEFAULT 0,
  source     TEXT NOT NULL CHECK (source IN ('news', 'ungrd')),
  source_url TEXT,
  UNIQUE (zone_id, place, event_date)          -- evita duplicados al volver a scrapear
);
CREATE INDEX IF NOT EXISTS fire_event_zone_date_idx ON fire_event (zone_id, event_date DESC);
-- Una noticia se guarda una sola vez (UNGRD comparte la misma URL del dataset en todas sus filas).
CREATE UNIQUE INDEX IF NOT EXISTS fire_event_news_url_key ON fire_event (source_url) WHERE source = 'news';
-- Otras noticias del mismo incendio (misma zona, <= 3 días): solo como referencia.
ALTER TABLE fire_event ADD COLUMN IF NOT EXISTS related_urls TEXT[] NOT NULL DEFAULT '{}';

-- Focos de calor (NASA FIRMS).
CREATE TABLE IF NOT EXISTS hotspot (
  id          BIGSERIAL PRIMARY KEY,
  location    GEOGRAPHY(Point, 4326) NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS hotspot_location_gix ON hotspot USING GIST (location);

-- Pronóstico de 72 h (modelo de ML, ver docs/ML.md): clima diario de los últimos 35 días por zona
-- (Open-Meteo, unidades nativas: mm, °C, %, km/h a 10 m). 'archive' = histórico ERA5; 'forecast' = días
-- recientes que el histórico aún llena con pronóstico (una ingesta posterior los reemplaza).
CREATE TABLE IF NOT EXISTS weather_daily (
  zone_id            TEXT NOT NULL REFERENCES zone(id),
  day                DATE NOT NULL,                 -- día local (America/Bogota)
  precipitation_mm   DOUBLE PRECISION,
  temperature_mean_c DOUBLE PRECISION,
  temperature_max_c  DOUBLE PRECISION,
  temperature_min_c  DOUBLE PRECISION,
  humidity_mean_pct  DOUBLE PRECISION,
  wind_max_kmh       DOUBLE PRECISION,
  wind_mean_kmh      DOUBLE PRECISION,
  et0_mm             DOUBLE PRECISION,              -- evapotranspiración de referencia FAO
  source             TEXT NOT NULL CHECK (source IN ('archive', 'forecast')),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (zone_id, day)
);

-- Detecciones VIIRS crudas de los últimos 35 días, una por satélite (el modelo cuenta cada pasada,
-- sin unir satélites). La tabla hotspot (mapa y puntaje actual) no cambia.
CREATE TABLE IF NOT EXISTS hotspot_detection (
  source      TEXT NOT NULL,                        -- ej. 'VIIRS_SNPP_NRT'
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (source, detected_at, latitude, longitude)
);

-- Días UTC que FIRMS ya entregó completos: el pronóstico solo usa el modelo si tiene los 30 días.
CREATE TABLE IF NOT EXISTS firms_complete_day (
  day        DATE PRIMARY KEY,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
