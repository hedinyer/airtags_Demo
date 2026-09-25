import type { OrigenGps } from "@/lib/distancia";

function esLat(n: number): boolean {
  return Number.isFinite(n) && n >= -90 && n <= 90;
}

function esLng(n: number): boolean {
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

/** Colombia: lat ≈ [-5, 14], lng ≈ [-82, -66]. */
function pareceLngLatColombia(a: number, b: number): boolean {
  return a >= -82 && a <= -66 && (a < -5 || a > 14) && b >= -5 && b <= 14;
}

/** Si el primer número no puede ser latitud, asume orden lng,lat. */
function parComoOrigen(a: number, b: number): OrigenGps | null {
  if (esLat(a) && esLng(b) && !pareceLngLatColombia(a, b)) {
    return { lat: a, lng: b };
  }
  if (esLat(b) && esLng(a)) return { lat: b, lng: a };
  return null;
}

function numeroFlexible(raw: string): number {
  return Number(raw.replace(",", "."));
}

/**
 * Acepta "4.609710, -74.081750", "4,609710 -74,081750",
 * geo:, q=, @lat,lng de Maps y !3dlat!4dlng.
 */
export function parsearCoordenadas(raw: string): OrigenGps | null {
  const text = raw.trim();
  if (!text) return null;

  const urlPairs: RegExp[] = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|destination|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
  ];

  for (const re of urlPairs) {
    const m = text.match(re);
    if (!m) continue;
    const origen = parComoOrigen(Number(m[1]), Number(m[2]));
    if (origen) return origen;
  }

  const cleaned = text.replace(/[°º]/g, " ").replace(/\s+/g, " ").trim();
  const pair = cleaned.match(
    /(-?\d+(?:[.,]\d+)?)\s*[,;\s/|]\s*(-?\d+(?:[.,]\d+)?)/,
  );
  if (!pair) return null;
  return parComoOrigen(numeroFlexible(pair[1]), numeroFlexible(pair[2]));
}

export function formatearCoordenadas(origen: OrigenGps): string {
  return `${origen.lat.toFixed(6)}, ${origen.lng.toFixed(6)}`;
}
