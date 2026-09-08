export type BleProximityBand =
  | "none"
  | "weak"
  | "fair"
  | "strong"
  | "immediate";

export type WebBluetoothSupport = {
  secureContext: boolean;
  hasBluetooth: boolean;
  hasRequestDevice: boolean;
  hasRequestLEScan: boolean;
  /** Escaneo continuo de anuncios (radar). */
  canScanAds: boolean;
  /** Conexión GATT (sonar). */
  canConnectGatt: boolean;
  isIos: boolean;
  isAndroid: boolean;
  reasonIfBlocked: string | null;
};

export type OfAdParse =
  | {
      kind: "nearby";
      status: number;
      /** Prefijo de 6 bytes si hay MAC; si no, null. */
      nearbyPrefixHex: string | null;
      macHex: string | null;
    }
  | {
      kind: "separated";
      status: number;
      /** Bytes 6..28 de la adv key (22 bytes) — no requieren MAC. */
      separatedSuffixHex: string;
      /** Nibble superior del primer byte (payload[23]). */
      startMs: number;
      macHex: string | null;
      fullKeyHex: string | null;
    };

export type BleMatchRequest = {
  manufacturerDataBase64: string;
  rssi: number | null;
  mac?: string | null;
  targetName: string;
};

export type BleMatchResponse =
  | {
      matched: true;
      name: string;
      id: string;
      band: BleProximityBand;
      rssi: number | null;
      ofKind: "nearby" | "separated";
    }
  | {
      matched: false;
      band: "none";
      rssi: number | null;
      reason?: string;
    };

export type DeviceKeyring = {
  name: string;
  id: string;
  nearby: string[];
  suffix: string[];
};
