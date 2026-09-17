import { queryPg } from "@/lib/pgPool";
import {
  SQL_EXPR_VALOR_CUOTA,
  SQL_FILTRO_PAGO_TARIFA,
  SQL_JOINS_PAGO_TARIFA,
} from "@/lib/sqlPagosCuota";

/** Contratos activos + cliente/vehículo. */
export const SQL_CLIENTES_EXTRACTO = `
SELECT
    ct.id AS contrato_id,
    cl.cedula,
    cl.nombre,
    v.placa,
    cl.telefono,
    ven.nombre AS visitador,
    ct.fecha_inicio::date AS fecha_inicio,
    ct.tarifa::numeric AS valor_cuota,
    ct.dias_contrato::text AS fecha_final
FROM arrendamientos_contrato ct
JOIN clientes_cliente cl ON cl.id = ct.cliente_id
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
LEFT JOIN clientes_vendedor ven ON ven.id = ct.vendedor_id
WHERE ct.estado = 'Activo'
  AND ct.fecha_inicio IS NOT NULL
  AND ct.tarifa > 0
  AND v.placa IS NOT NULL
  AND TRIM(v.placa) <> ''
`;

/**
 * Pagos que abonan cuotas (contratos activos).
 * Prorratea por ítem `tarifa` (no cuenta pago_inicial / abono_credito / multa ítem).
 * Igual que sp_recuperadores / sistema Julián.
 */
export const SQL_REGISTROS_EXTRACTO = `
SELECT
    contrato_id,
    fecha_registro,
    valor,
    tipo,
    referencia
FROM (
  SELECT
      ct.id AS contrato_id,
      pf.fecha_pago::date AS fecha_registro,
      (${SQL_EXPR_VALOR_CUOTA.trim()}) AS valor,
      COALESCE(mp.nombre, '') AS tipo,
      COALESCE(pf.referencia, '') AS referencia
  FROM terminal_pagos_pagofactura pf
  JOIN terminal_pagos_factura f ON f.id = pf.factura_id
  JOIN arrendamientos_contrato ct ON ct.id = f.contrato_id
  ${SQL_JOINS_PAGO_TARIFA}
  WHERE ct.estado = 'Activo'
    AND ct.fecha_inicio IS NOT NULL
    AND ${SQL_FILTRO_PAGO_TARIFA.trim()}
) pagos_cuota
WHERE valor > 0
ORDER BY contrato_id, fecha_registro
`;

export const SQL_FREEZE_DAYS = `
SELECT contrato_id, fecha::text AS fecha
FROM arrendamientos_freezeday
`;

export function freezeDaysByContrato(
  rows: Array<{ contrato_id: string | number; fecha: string | null }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const fecha = String(row.fecha ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const key = String(row.contrato_id);
    const list = map.get(key) ?? [];
    list.push(fecha);
    map.set(key, list);
  }
  return map;
}

export async function fetchFreezeDaysPorContrato(
  connectionString: string,
): Promise<Map<string, string[]>> {
  try {
    const rows = await queryPg<{
      contrato_id: string | number;
      fecha: string | null;
    }>(connectionString, SQL_FREEZE_DAYS);
    return freezeDaysByContrato(rows);
  } catch (e) {
    console.warn(
      "[reporteFromDb] arrendamientos_freezeday:",
      e instanceof Error ? e.message : e,
    );
    return new Map();
  }
}
