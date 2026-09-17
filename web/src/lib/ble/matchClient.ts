import type { BleMatchRequest, BleMatchResponse } from "@/lib/ble/types";

export async function matchBleAdvertisement(
  body: BleMatchRequest,
): Promise<BleMatchResponse> {
  const res = await fetch("/api/ble/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `match HTTP ${res.status}`);
  }
  return (await res.json()) as BleMatchResponse;
}
