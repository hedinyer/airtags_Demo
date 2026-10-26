import { normalizarPlaca } from "@/lib/placasExcluidasReportes";

export type CuentaSingpsId =
  | "motosprom"
  | "chiaberapinilla"
  | "solucion110"
  | "beraspmotos"
  | "andreamonedas";

export type CuentaSingps = {
  id: CuentaSingpsId;
  email: string;
  etiqueta: string;
  color: string;
  placas: readonly string[];
  destacadas?: readonly string[];
};

export const CUENTAS_SINGPS: readonly CuentaSingps[] = [
  {
    id: "motosprom",
    email: "motosprom@icloud.com",
    etiqueta: "iPhone 16",
    color: "#38bdf8",
    placas: [
      "HAI41I",
      "HAI38I",
      "OSD62H",
      "KFK31I",
      "HAO81I",
      "KFK36I",
      "OSC02H",
      "HAI33I",
      "KFE75I",
      "TIN98H",
      "KFK43I",
      "HAI44I",
      "HAO82I",
      "HAI37I",
      "HAI31I",
      "KFK37I",
      "MCO76H",
      "HAI40I",
      "HAI34I",
    ],
    destacadas: ["OSC02H", "TIN98H"],
  },
  {
    id: "chiaberapinilla",
    email: "chiaberapinilla@icloud.com",
    etiqueta: "Verde",
    color: "#4ade80",
    placas: [
      "GXD34I",
      "GYJ64I",
      "KAY54I",
      "KAY35I",
      "MPQ50I",
      "MPQ51I",
      "KAY39I",
      "KAY38I",
      "KAY41I",
      "KAY50I",
      "KAY30I",
      "GYJ66I",
      "GYJ67I",
      "GYJ62I",
      "GYJ61I",
    ],
  },
  {
    id: "solucion110",
    email: "solucion110@icloud.com",
    etiqueta: "Rojo 6",
    color: "#f87171",
    placas: [
      "CHU78I",
      "ESM84I",
      "CIG34I",
      "CHU80I",
      "CII20I",
      "CHU68I",
      "CHU65I",
      "CII17I",
      "CHU66I",
      "CHV03I",
      "CII15I",
      "CIG59I",
      "CIG23I",
      "CHU73I",
    ],
  },
  {
    id: "beraspmotos",
    email: "beraspmotos@icloud.com",
    etiqueta: "Blanco 13",
    color: "#e4e4e7",
    placas: [
      "ZPE19H",
      "CHE11I",
      "ZPI46H",
      "CHE33I",
      "ZPV92H",
      "CHE13I",
      "ZPV95H",
      "CHE35I",
      "CHE37I",
      "ZPV94H",
      "ZPE16H",
      "ZPV71H",
      "ZPI35H",
    ],
  },
  {
    id: "andreamonedas",
    email: "andreamonedas5@gmail.com",
    etiqueta: "XR Rojo",
    color: "#fb7185",
    placas: [
      "TSP13H",
      "TSQ34H",
      "TSP07H",
      "TST13H",
      "TSQ48H",
      "TST09H",
      "TSP15H",
      "TST01H",
      "TSP04H",
      "TSQ41H",
      "TSP06H",
    ],
  },
];

const PLACA_A_CUENTA = new Map<string, CuentaSingps>();
const DESTACADAS = new Set<string>();

for (const cuenta of CUENTAS_SINGPS) {
  for (const placa of cuenta.placas) {
    PLACA_A_CUENTA.set(normalizarPlaca(placa), cuenta);
  }
  for (const placa of cuenta.destacadas ?? []) {
    DESTACADAS.add(normalizarPlaca(placa));
  }
}

export const TOTAL_PLACAS_SINGPS = PLACA_A_CUENTA.size;

export function cuentaDePlaca(placa: string): CuentaSingps | null {
  return PLACA_A_CUENTA.get(normalizarPlaca(placa)) ?? null;
}

export function placaEsSingps(placa: string): boolean {
  return PLACA_A_CUENTA.has(normalizarPlaca(placa));
}

export function placaDestacadaSingps(placa: string): boolean {
  return DESTACADAS.has(normalizarPlaca(placa));
}
