import { getDatabaseUrls } from "@/lib/dbUrls";
import { queryPg } from "@/lib/pgPool";
import type { RolCampo } from "@/lib/campoConstants";

export type OperadorCampo = {
  rol: RolCampo;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  updated_at: string;
};

function dbUrl(): string {
  const [url] = getDatabaseUrls();
  if (!url) throw new Error("DATABASE_URL no configurada");
  return url;
}

let ensureTablesPromise: Promise<void> | null = null;

/** Crea tablas si aún no existen (ponytail: evita paso manual en dev). */
export async function ensureCampoTables(): Promise<void> {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      await queryPg(
        dbUrl(),
        `CREATE TABLE IF NOT EXISTS sesion_operadores (
          rol TEXT PRIMARY KEY CHECK (rol IN ('nicolas', 'yonser')),
          lat DOUBLE PRECISION NOT NULL,
          lng DOUBLE PRECISION NOT NULL,
          accuracy_m DOUBLE PRECISION,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
      );
      await queryPg(
        dbUrl(),
        `CREATE TABLE IF NOT EXISTS sesion_asignaciones (
          placa TEXT PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
      );
    })().catch((e) => {
      ensureTablesPromise = null;
      throw e;
    });
  }
  return ensureTablesPromise;
}

export async function upsertPosicionCampo(
  rol: RolCampo,
  lat: number,
  lng: number,
  accuracy_m: number | null,
): Promise<void> {
  await queryPg(
    dbUrl(),
    `INSERT INTO sesion_operadores (rol, lat, lng, accuracy_m, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (rol) DO UPDATE SET
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       accuracy_m = EXCLUDED.accuracy_m,
       updated_at = NOW()`,
    [rol, lat, lng, accuracy_m],
  );
}

export async function fetchEstadoCampo(): Promise<{
  operadores: Partial<Record<RolCampo, OperadorCampo>>;
  asignadas: string[];
}> {
  const [ops, asignadas] = await Promise.all([
    queryPg<{
      rol: RolCampo;
      lat: number;
      lng: number;
      accuracy_m: number | null;
      updated_at: Date;
    }>(
      dbUrl(),
      `SELECT rol, lat, lng, accuracy_m, updated_at FROM sesion_operadores`,
    ),
    queryPg<{ placa: string }>(
      dbUrl(),
      `SELECT placa FROM sesion_asignaciones ORDER BY created_at ASC`,
    ),
  ]);

  const operadores: Partial<Record<RolCampo, OperadorCampo>> = {};
  for (const o of ops) {
    operadores[o.rol] = {
      rol: o.rol,
      lat: o.lat,
      lng: o.lng,
      accuracy_m: o.accuracy_m,
      updated_at: o.updated_at.toISOString(),
    };
  }

  return {
    operadores,
    asignadas: asignadas.map((a) => a.placa),
  };
}

export async function toggleAsignacionCampo(
  placa: string,
  activa: boolean,
): Promise<void> {
  if (activa) {
    await queryPg(
      dbUrl(),
      `INSERT INTO sesion_asignaciones (placa, created_at)
       VALUES ($1, NOW())
       ON CONFLICT (placa) DO NOTHING`,
      [placa],
    );
  } else {
    await queryPg(
      dbUrl(),
      `DELETE FROM sesion_asignaciones WHERE placa = $1`,
      [placa],
    );
  }
}
