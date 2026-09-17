import type { ResultadoAtraso } from "@/lib/atrasosFromDb";
import { normalizarPlaca } from "@/lib/placasExcluidasReportes";
import { getSpSedes } from "@/lib/spSedes";

type AtrasoRow = {
  user_moto_compra_id: string;
  monto_adeudado: number | null;
  dias_atraso: number | null;
  periodos_pagados: number | null;
  periodos_debidos: number | null;
  fecha_inicio: string | null;
};

type CompraRow = {
  id: string;
  placa: string | null;
  monto_cuota_periodo: number | null;
};

async function fetchJson<T>(url: string, anonKey: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function atrasosDeSede(url: string, anonKey: string): Promise<ResultadoAtraso[]> {
  const base = url.replace(/\/$/, "");
  const [atrasos, compras] = await Promise.all([
    fetchJson<AtrasoRow[]>(
      `${base}/rest/v1/atrasos?select=user_moto_compra_id,monto_adeudado,dias_atraso,periodos_pagados,periodos_debidos,fecha_inicio&monto_adeudado=gt.0`,
      anonKey,
    ),
    fetchJson<CompraRow[]>(
      `${base}/rest/v1/user_moto_compra?select=id,placa,monto_cuota_periodo&placa=not.is.null`,
      anonKey,
    ),
  ]);

  const compraById = new Map(compras.map((c) => [c.id, c]));
  const out: ResultadoAtraso[] = [];

  for (const a of atrasos) {
    const compra = compraById.get(a.user_moto_compra_id);
    const placa = normalizarPlaca(compra?.placa ?? "");
    const deuda = Number(a.monto_adeudado) || 0;
    if (!placa || deuda <= 0) continue;

    const pagadas = Number(a.periodos_pagados) || 0;
    const generadas = Number(a.periodos_debidos) || 0;
    const pendientes = Math.max(0, generadas - pagadas);
    const valorCuota = Number(compra?.monto_cuota_periodo) || 0;
    const fecha = String(a.fecha_inicio ?? "").slice(0, 10);

    out.push({
      placa,
      cedula: "",
      nombre: "",
      telefono: "",
      fecha_inicio: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "",
      valor_cuota: Math.round(valorCuota),
      deuda_total: Math.round(deuda),
      dias_mora: Math.max(0, Number(a.dias_atraso) || 0),
      cuotas_pagadas: pagadas,
      cuotas_pendientes: pendientes,
      cuotas_generadas: generadas,
    });
  }

  return out;
}

/** Cartera con deuda > 0 desde Bogotá / Girardot / BGA. */
export async function fetchAtrasosDesdeSp(): Promise<ResultadoAtraso[]> {
  const sedes = getSpSedes();
  const results = await Promise.allSettled(
    sedes.map((s) => atrasosDeSede(s.url, s.anonKey)),
  );

  const byPlaca = new Map<string, ResultadoAtraso>();
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === "rejected") {
      console.warn(
        `[atrasosFromSp] ${sedes[i]?.nombre}:`,
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
      continue;
    }
    for (const a of r.value) {
      const key = normalizarPlaca(a.placa);
      const prev = byPlaca.get(key);
      // ponytail: si la placa está en 2 sedes, quedarse con la deuda mayor
      if (!prev || a.deuda_total > prev.deuda_total) {
        byPlaca.set(key, a);
      }
    }
  }

  return [...byPlaca.values()];
}

/** Une Railway + SP; SP gana si trae más deuda (o si Railway no tiene la placa). */
export function mergeAtrasos(
  railway: ResultadoAtraso[],
  sp: ResultadoAtraso[],
): ResultadoAtraso[] {
  const byPlaca = new Map<string, ResultadoAtraso>();
  for (const a of railway) {
    byPlaca.set(normalizarPlaca(a.placa), a);
  }
  for (const a of sp) {
    const key = normalizarPlaca(a.placa);
    const prev = byPlaca.get(key);
    if (!prev || a.deuda_total > prev.deuda_total) {
      byPlaca.set(key, {
        ...a,
        // conservar contacto de Railway si SP no lo trae
        nombre: a.nombre || prev?.nombre || "",
        telefono: a.telefono || prev?.telefono || "",
        cedula: a.cedula || prev?.cedula || "",
      });
    } else if (prev && (!prev.nombre || !prev.telefono)) {
      byPlaca.set(key, {
        ...prev,
        nombre: prev.nombre || a.nombre,
        telefono: prev.telefono || a.telefono,
      });
    }
  }
  return [...byPlaca.values()].sort((a, b) => b.deuda_total - a.deuda_total);
}
