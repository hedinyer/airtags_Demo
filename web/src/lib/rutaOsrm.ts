export type PuntoLatLng = { lat: number; lng: number };

export type RutaOsrm = {
  coords: PuntoLatLng[];
  distance_m: number;
  duration_s: number;
};

/** Ruta en coche vía OSRM público. Fallback línea recta si falla. */
export async function obtenerRutaOsrm(
  origen: PuntoLatLng,
  destino: PuntoLatLng,
): Promise<RutaOsrm> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${origen.lng},${origen.lat};${destino.lng},${destino.lat}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = (await res.json()) as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }>;
    };
    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates?.length) throw new Error("Sin ruta");
    return {
      coords: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      distance_m: route.distance,
      duration_s: route.duration,
    };
  } catch {
    return rutaRecta(origen, destino);
  }
}

function rutaRecta(a: PuntoLatLng, b: PuntoLatLng): RutaOsrm {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLon / 2) ** 2;
  const distance_m = 2 * R * Math.asin(Math.sqrt(h));
  return {
    coords: [a, b],
    distance_m,
    duration_s: distance_m / 11.1,
  };
}

export function formatearDuracionRuta(segundos: number): string {
  const m = Math.round(segundos / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function formatearDistanciaRuta(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1)} km`;
}
