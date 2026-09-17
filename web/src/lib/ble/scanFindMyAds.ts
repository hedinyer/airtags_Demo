import {
  dataViewToUint8,
  uint8ToBase64,
} from "@/lib/ble/parseOfAd";
import { emaRssi } from "@/lib/ble/rssiBands";
import { getWebBluetoothSupport } from "@/lib/ble/webBluetoothSupport";

export const APPLE_COMPANY_ID = 0x004c;

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

/**
 * Escaneo continuo Offline Finding (Apple 0x004C).
 * Debe llamarse desde un gesto de usuario.
 */
export async function startFindMyAdScan(
  onAd: (ev: FindMyAdEvent) => void,
): Promise<FindMyScanHandle> {
  const support = getWebBluetoothSupport();
  if (!support.canScanAds) {
    throw new Error(support.reasonIfBlocked || "Escaneo BLE no disponible");
  }
  const bluetooth = navigator.bluetooth;
  if (!bluetooth?.requestLEScan) {
    throw new Error("requestLEScan no disponible");
  }

  const scan = await bluetooth.requestLEScan({
    keepRepeatedDevices: true,
    filters: [{ manufacturerData: [{ companyIdentifier: APPLE_COMPANY_ID }] }],
  });

  const rssiEma = new Map<string, number>();

  const listener = (event: BluetoothAdvertisingEvent) => {
    const view = event.manufacturerData?.get(APPLE_COMPANY_ID);
    if (!view) return;
    const appleBytes = dataViewToUint8(view);
    if (appleBytes.length < 2 || appleBytes[0] !== 0x12) return;

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
