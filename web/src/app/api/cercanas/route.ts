import { NextResponse } from "next/server";

import { fetchAtrasosDesdeDb } from "@/lib/atrasosFromDb";
import { fetchUbicacionesAirTag } from "@/lib/airtagLocations";
import type { MotoCercanaApi } from "@/lib/cercanasTypes";
import { normalizarPlaca } from "@/lib/placasExcluidasReportes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const force = new URL(req.url).searchParams.get("refresh") === "1";
    const [atrasos, ubicaciones] = await Promise.all([
      fetchAtrasosDesdeDb(force),
      fetchUbicacionesAirTag(),
    ]);

    const motos: MotoCercanaApi[] = [];
    for (const a of atrasos) {
      const key = normalizarPlaca(a.placa);
      const gps = ubicaciones.get(key);
      if (!gps) continue;
      motos.push({
        placa: key,
        nombre: a.nombre,
        telefono: a.telefono,
        deuda_total: a.deuda_total,
        fecha_inicio: a.fecha_inicio,
        cuotas_pagadas: a.cuotas_pagadas,
        cuotas_pendientes: a.cuotas_pendientes,
        cuotas_generadas: a.cuotas_generadas,
        lat: gps.lat,
        lng: gps.lng,
        accuracy_m: gps.accuracy_m,
        visto_en: gps.visto_en,
      });
    }

    return NextResponse.json({
      motos,
      generado_en: new Date().toISOString(),
      total_con_airtag: motos.length,
      total_atrasos: atrasos.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    console.error("[api/cercanas]", message);
    return NextResponse.json(
      { error: "No se pudo cargar la cartera. Revisa la conexión e inténtalo de nuevo." },
      { status: 500 },
    );
  }
}
