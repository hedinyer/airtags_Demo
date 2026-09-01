import { NextResponse } from "next/server";

import { CAMPO_STALE_MS } from "@/lib/campoConstants";
import { ensureCampoTables, fetchEstadoCampo } from "@/lib/campoDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function operadorVivo(updated_at: string): boolean {
  return Date.now() - new Date(updated_at).getTime() <= CAMPO_STALE_MS;
}

export async function GET() {
  try {
    await ensureCampoTables();
    const { operadores, asignadas } = await fetchEstadoCampo();

    const ops: Record<
      string,
      {
        lat: number;
        lng: number;
        accuracy_m: number | null;
        updated_at: string;
        vivo: boolean;
      }
    > = {};

    for (const [rol, op] of Object.entries(operadores)) {
      if (!op) continue;
      ops[rol] = {
        lat: op.lat,
        lng: op.lng,
        accuracy_m: op.accuracy_m,
        updated_at: op.updated_at,
        vivo: operadorVivo(op.updated_at),
      };
    }

    return NextResponse.json({
      operadores: ops,
      asignadas,
      generado_en: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    console.error("[api/campo/estado]", message);
    return NextResponse.json(
      { error: "No se pudo leer el estado de campo." },
      { status: 500 },
    );
  }
}
