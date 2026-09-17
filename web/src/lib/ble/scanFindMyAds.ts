import {
  dataViewToUint8,
  uint8ToBase64,
} from "@/lib/ble/parseOfAd";
import { emaRssi } from "@/lib/ble/rssiBands";
import { getWebBluetoothSupport } from "@/lib/ble/webBluetoothSupport";

export const APPLE_COMPANY_ID = 0x004c;
const OF_TYPE = 0x12;

export type FindMyAdEvent = {
  device: BluetoothDevice;
  rssi: number | null;
  manufacturerDataBase64: string;
  appleBytes: Uint8Array;
  seenAt: number;
};

export type FindMyScanHandle = {
  stop: () => void;
};

export type FindMyScanStats = {
  adsTotal: number;
  adsOf: number;
};

function mensajeErrorScan(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const lower = raw.toLowerCase();
  if (
    lower.includes("adapter not available") ||
    lower.includes("bluetooth adapter")
  ) {
    return [
      "Chrome no ve el Bluetooth del teléfono.",
      "1) Enciende Bluetooth.",
      "2) Enciende Ubicación (Android la pide para escanear BLE).",
      "3) Ajustes → Apps → Chrome → Permisos: Ubicación y Dispositivos cercanos = Permitir.",
      "4) Cierra Chrome por completo y vuelve a abrir la página.",
    ].join(" ");
  }
  if (lower.includes("notallowed") || lower.includes("permission")) {
    return "Permiso de Bluetooth denegado. Pulsa Iniciar de nuevo y acepta el diálogo, o revisa permisos de Chrome.";
  }
  if (lower.includes("user cancelled") || lower.includes("canceled")) {
    return "Escaneo cancelado. Pulsa Iniciar otra vez y acepta el permiso.";
  }
  return raw || "No se pudo iniciar el escaneo BLE";
}

/** Extrae bytes Offline Finding aunque el stack incluya company id 4C 00. */
export function extractOfAppleBytes(view: DataView): Uint8Array | null {
  const raw = dataViewToUint8(view);
  if (raw.length >= 2 && raw[0] === OF_TYPE) return raw;
  // Algunos stacks entregan company id + payload
  if (
    raw.length >= 4 &&
    raw[0] === 0x4c &&
    raw[1] === 0x00 &&
    raw[2] === OF_TYPE
  ) {
    return raw.subarray(2);
  }
  return null;
}

/**
 * Escaneo continuo Offline Finding (Apple 0x004C).
 * Debe llamarse desde un gesto de usuario.
 *
 * Usa acceptAllAdvertisements: el filtro manufacturerData falla en varios Chrome Android.
 */
export async function startFindMyAdScan(
  onAd: (ev: FindMyAdEvent) => void,
  onStats?: (stats: FindMyScanStats) => void,
): Promise<FindMyScanHandle> {
  const support = getWebBluetoothSupport();
  if (!support.canScanAds) {
    throw new Error(support.reasonIfBlocked || "Escaneo BLE no disponible");
  }
  const bluetooth = navigator.bluetooth;
  if (!bluetooth?.requestLEScan) {
    throw new Error("requestLEScan no disponible");
  }

  try {
    const available = await bluetooth.getAvailability?.();
    if (available === false) {
      throw new Error("Bluetooth adapter not available");
    }
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.toLowerCase().includes("adapter not available")
    ) {
      throw new Error(mensajeErrorScan(err));
    }
  }

  let scan: BluetoothLEScan;
  try {
    // acceptAll es más fiable en Android; filtramos OF en el listener.
    scan = await bluetooth.requestLEScan({
      keepRepeatedDevices: true,
      acceptAllAdvertisements: true,
    });
  } catch (err) {
    // Fallback al filtro Apple si el navegador rechaza acceptAll
    try {
      scan = await bluetooth.requestLEScan({
        keepRepeatedDevices: true,
        filters: [{ manufacturerData: [{ companyIdentifier: APPLE_COMPANY_ID }] }],
      });
    } catch (err2) {
      throw new Error(mensajeErrorScan(err2 ?? err));
    }
  }

  const rssiEma = new Map<string, number>();
  const stats: FindMyScanStats = { adsTotal: 0, adsOf: 0 };

  const listener = (event: BluetoothAdvertisingEvent) => {
    stats.adsTotal += 1;
    const view = event.manufacturerData?.get(APPLE_COMPANY_ID);
    if (!view) {
      onStats?.(stats);
      return;
    }
    const appleBytes = extractOfAppleBytes(view);
    if (!appleBytes || appleBytes.length < 2) {
      onStats?.(stats);
      return;
    }
    stats.adsOf += 1;
    onStats?.(stats);

    const id = event.device?.id || "unknown";
    const rawRssi =
      typeof event.rssi === "number" && Number.isFinite(event.rssi)
        ? event.rssi
        : null;
    let rssi = rawRssi;
    if (rawRssi != null) {
      const smoothed = emaRssi(rssiEma.get(id) ?? null, rawRssi);
      rssiEma.set(id, smoothed);
      rssi = smoothed;
    }

    onAd({
      device: event.device,
      rssi,
      manufacturerDataBase64: uint8ToBase64(appleBytes),
      appleBytes,
      seenAt: Date.now(),
    });
  };

  bluetooth.addEventListener("advertisementreceived", listener);

  return {
    stop: () => {
      try {
        scan.stop();
      } catch {
        /* ignore */
      }
      bluetooth.removeEventListener("advertisementreceived", listener);
    },
  };
}
