/**
 * Self-check: chasis→placa + merge SP vs Railway.
 * Run: npx --yes tsx src/lib/atrasosFromSp.check.ts
 */
import assert from "node:assert/strict";
import { resolverPlacaDesdeNombreAirTag } from "./chasisPlaca";
import { mergeAtrasos } from "./atrasosFromSp";
import type { ResultadoAtraso } from "./atrasosFromDb";

assert.equal(resolverPlacaDesdeNombreAirTag("0096"), "LYB96I");
assert.equal(resolverPlacaDesdeNombreAirTag("5"), "JQX11I");
assert.equal(resolverPlacaDesdeNombreAirTag("0005"), "JQX11I");
assert.equal(resolverPlacaDesdeNombreAirTag("3492"), "LXR57I");
assert.equal(resolverPlacaDesdeNombreAirTag("LYB89I"), "LYB89I");

const base = {
  cedula: "",
  nombre: "",
  telefono: "",
  fecha_inicio: "2026-01-01",
  valor_cuota: 40000,
  dias_mora: 1,
  cuotas_pagadas: 1,
  cuotas_pendientes: 1,
  cuotas_generadas: 2,
} satisfies Omit<ResultadoAtraso, "placa" | "deuda_total">;

const railway: ResultadoAtraso[] = [
  { ...base, placa: "ABC12I", deuda_total: 0, nombre: "Rail" },
];
const sp: ResultadoAtraso[] = [
  { ...base, placa: "ABC12I", deuda_total: 2100000 },
  { ...base, placa: "JQX11I", deuda_total: 50000 },
];
const merged = mergeAtrasos(railway, sp);
const abc = merged.find((m) => m.placa === "ABC12I");
assert.ok(abc);
assert.equal(abc.deuda_total, 2100000);
assert.equal(abc.nombre, "Rail");
assert.ok(merged.some((m) => m.placa === "JQX11I" && m.deuda_total === 50000));

console.log("atrasosFromSp.check.ts OK");
