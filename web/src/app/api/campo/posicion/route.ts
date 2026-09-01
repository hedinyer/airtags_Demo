import { NextResponse } from "next/server";

import { esRolCampo } from "@/lib/campoConstants";
import { ensureCampoTables, upsertPosicionCampo } from "@/lib/campoDb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const { rol, lat, lng, accuracy_m } = body as Record<string, unknown>;
    if (!esRolCampo(rol)) {
      return NextResponse.json({ error: "rol inválido" }, { status: 400 });
    }
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return NextResponse.json({ error: "lat/lng inválidos" }, { status: 400 });
    }

    const acc =
      typeof accuracy_m === "number" && Number.isFinite(accuracy_m)
        ? accuracy_m
        : null;

    await ensureCampoTables();
    await upsertPosicionCampo(rol, lat, lng, acc);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    console.error("[api/campo/posicion]", message);
    return NextResponse.json(
      { error: "No se pudo guardar la posición." },
      { status: 500 },
    );
  }
}
