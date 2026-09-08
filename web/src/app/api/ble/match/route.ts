import { NextResponse } from "next/server";

import { loadDeviceKeyring } from "@/lib/ble/loadKeyring";
import { base64ToUint8, parseAppleOfManufacturerData } from "@/lib/ble/parseOfAd";
import { bandFromRssi } from "@/lib/ble/rssiBands";
import type { BleMatchRequest, BleMatchResponse } from "@/lib/ble/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: BleMatchRequest;
  try {
    body = (await req.json()) as BleMatchRequest;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const targetName = String(body.targetName || "").trim();
  if (!targetName) {
    return NextResponse.json(
      { error: "targetName requerido" },
      { status: 400 },
    );
  }
  if (!body.manufacturerDataBase64) {
    return NextResponse.json(
      { error: "manufacturerDataBase64 requerido" },
      { status: 400 },
    );
  }

  let appleBytes: Uint8Array;
  try {
    appleBytes = base64ToUint8(body.manufacturerDataBase64);
  } catch {
    return NextResponse.json(
      { error: "manufacturerDataBase64 inválido" },
      { status: 400 },
    );
  }

  const rssi =
    typeof body.rssi === "number" && Number.isFinite(body.rssi)
      ? body.rssi
      : null;
  const band = bandFromRssi(rssi);

  const parsed = parseAppleOfManufacturerData(appleBytes, body.mac ?? null);
  if (!parsed) {
    const res: BleMatchResponse = {
      matched: false,
      band: "none",
      rssi,
      reason: "not_of",
    };
    return NextResponse.json(res);
  }

  const keyring = await loadDeviceKeyring(targetName);
  if (!keyring) {
    const res: BleMatchResponse = {
      matched: false,
      band: "none",
      rssi,
      reason: "no_keyring",
    };
    return NextResponse.json(res);
  }

  const nearbySet = new Set(keyring.nearby);
  const suffixSet = new Set(keyring.suffix);

  let matched = false;
  if (parsed.kind === "separated") {
    matched = suffixSet.has(parsed.separatedSuffixHex.toLowerCase());
    // Si el navegador expone MAC, exige también el prefijo (más estricto).
    if (matched && parsed.fullKeyHex) {
      const prefix = parsed.fullKeyHex.toLowerCase().slice(0, 12);
      if (nearbySet.size > 0 && !nearbySet.has(prefix)) matched = false;
    }
  } else if (parsed.nearbyPrefixHex) {
    matched = nearbySet.has(parsed.nearbyPrefixHex.toLowerCase());
  } else {
    const res: BleMatchResponse = {
      matched: false,
      band: "none",
      rssi,
      reason: "nearby_needs_mac",
    };
    return NextResponse.json(res);
  }

  if (!matched) {
    const res: BleMatchResponse = {
      matched: false,
      band: "none",
      rssi,
      reason: "no_match",
    };
    return NextResponse.json(res);
  }

  const res: BleMatchResponse = {
    matched: true,
    name: keyring.name,
    id: keyring.id,
    band: band === "none" ? "weak" : band,
    rssi,
    ofKind: parsed.kind,
  };
  return NextResponse.json(res);
}
