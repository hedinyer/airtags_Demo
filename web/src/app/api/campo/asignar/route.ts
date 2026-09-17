import { NextResponse } from "next/server";

import { ensureCampoTables, toggleAsignacionCampo } from "@/lib/campoDb";
import { normalizarPlaca } from "@/lib/placasExcluidasReportes";

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

    const { placa, activa } = body as Record<string, unknown>;
    const key = typeof placa === "string" ? normalizarPlaca(placa) : "";
    if (!key) {
      return NextResponse.json({ error: "placa inválida" }, { status: 400 });
    }
    if (typeof activa !== "boolean") {
      return NextResponse.json({ error: "activa debe ser boolean" }, { status: 400 });
    }

    await ensureCampoTables();
    await toggleAsignacionCampo(key, activa);

    return NextResponse.json({ ok: true, placa: key, activa });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    console.error("[api/campo/asignar]", message);
    return NextResponse.json(
      { error: "No se pudo actualizar la asignación." },
      { status: 500 },
    );
  }
}
