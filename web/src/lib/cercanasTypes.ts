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

export type CercanasResponse = {
  motos: MotoCercanaApi[];
  generado_en: string;
  total_con_airtag: number;
  total_atrasos: number;
};
