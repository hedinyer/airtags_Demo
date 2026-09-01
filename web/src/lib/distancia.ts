export const DISTANCIA_MAX_CERCANAS_KM = 5;

export type OrigenGps = { lat: number; lng: number };

/** Distancia Haversine en km. */
export function distanciaKm(a: OrigenGps, b: OrigenGps): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatearDistancia(km: number | null): string {
  if (km == null) return "Sin GPS";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
