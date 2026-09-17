-- Modo campo: ubicaciones de operadores y asignaciones Nicolas → Yonser
-- Ejecutar una vez en Railway Postgres.

CREATE TABLE IF NOT EXISTS sesion_operadores (
  rol TEXT PRIMARY KEY CHECK (rol IN ('nicolas', 'yonser')),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sesion_asignaciones (
  placa TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
