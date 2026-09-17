export type MotoCercanaApi = {
  placa: string;
  nombre: string;
  telefono: string;
  deuda_total: number;
  fecha_inicio: string;
  cuotas_pagadas: number;
  cuotas_pendientes: number;
  cuotas_generadas: number;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  visto_en: string | null;
};

/** Listado de campo / cercanas: solo cartera. La búsqueda sí incluye al día. */
export function tieneDeudaCartera(m: {
  deuda_total: number;
  cuotas_pendientes: number;
}): boolean {
  return m.deuda_total > 0 || m.cuotas_pendientes > 0;
}

export type CercanasResponse = {
  motos: MotoCercanaApi[];
  generado_en: string;
  total_con_airtag: number;
  total_atrasos: number;
};
