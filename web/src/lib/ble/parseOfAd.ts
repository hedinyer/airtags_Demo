import type { OfAdParse } from "@/lib/ble/types";

const OF_TYPE = 0x12;
const OF_HEADER = 2;
const NEARBY_PAYLOAD = 2;
const SEPARATED_PAYLOAD = 25;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeMacHex(mac: string | null | undefined): string | null {
  if (!mac) return null;
  const hex = mac.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (hex.length !== 12) return null;
  return hex;
}

/**
 * Parsea manufacturer data Apple (sin company id) como Offline Finding.
 * Sin MAC real, Nearby no puede reconstruir el prefijo; Separated sí (suffix 22 bytes).
 */
export function parseAppleOfManufacturerData(
  appleData: Uint8Array,
  macAddress?: string | null,
): OfAdParse | null {
  if (appleData.length < OF_HEADER) return null;
  if (appleData[0] !== OF_TYPE) return null;
  const payloadLen = appleData[1];
  const payload = appleData.subarray(OF_HEADER);
  if (payload.length < payloadLen) return null;
  const body = payload.subarray(0, payloadLen);
  const macHex = normalizeMacHex(macAddress ?? null);

  if (payloadLen === NEARBY_PAYLOAD) {
    if (body.length < 2) return null;
    const status = body[0];
    if (!macHex) {
      return {
        kind: "nearby",
        status,
        nearbyPrefixHex: null,
        macHex: null,
      };
    }
    const macBytes = Uint8Array.from(
      macHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
    );
    const pubkeyMiddle = macBytes.subarray(1);
    const pubkeyStartMs = body[1] << 6;
    const pubkeyStartLs = macBytes[0] & 0b00111111;
    const pubkeyStart = (pubkeyStartMs | pubkeyStartLs) & 0xff;
    const prefix = new Uint8Array(6);
    prefix[0] = pubkeyStart;
    prefix.set(pubkeyMiddle, 1);
    return {
      kind: "nearby",
      status,
      nearbyPrefixHex: bytesToHex(prefix),
      macHex,
    };
  }

  if (payloadLen === SEPARATED_PAYLOAD) {
    if (body.length < 25) return null;
    const status = body[0];
    const pubkeyEnd = body.subarray(1, 23);
    const startMs = body[23];
    const separatedSuffixHex = bytesToHex(pubkeyEnd);
    let fullKeyHex: string | null = null;
    if (macHex) {
      const macBytes = Uint8Array.from(
        macHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
      );
      const pubkeyMiddle = macBytes.subarray(1);
      const pubkeyStartMs = startMs << 6;
      const pubkeyStartLs = macBytes[0] & 0b00111111;
      const pubkeyStart = (pubkeyStartMs | pubkeyStartLs) & 0xff;
      const full = new Uint8Array(28);
      full[0] = pubkeyStart;
      full.set(pubkeyMiddle, 1);
      full.set(pubkeyEnd, 6);
      fullKeyHex = bytesToHex(full);
    }
    return {
      kind: "separated",
      status,
      separatedSuffixHex,
      startMs,
      macHex,
      fullKeyHex,
    };
  }

  return null;
}

export function dataViewToUint8(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
