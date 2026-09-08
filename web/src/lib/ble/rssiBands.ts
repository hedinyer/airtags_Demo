import type { BleProximityBand } from "@/lib/ble/types";

/** Umbrales RSSI (dBm) calibrables para AirTag / Find My. */
const THRESHOLDS = {
  immediate: -55,
  strong: -70,
  fair: -85,
  weak: -100,
} as const;

export function bandFromRssi(rssi: number | null | undefined): BleProximityBand {
  if (rssi == null || !Number.isFinite(rssi)) return "none";
  if (rssi >= THRESHOLDS.immediate) return "immediate";
  if (rssi >= THRESHOLDS.strong) return "strong";
  if (rssi >= THRESHOLDS.fair) return "fair";
  if (rssi >= THRESHOLDS.weak) return "weak";
  return "none";
}

export function bandRank(band: BleProximityBand): number {
  switch (band) {
    case "immediate":
      return 4;
    case "strong":
      return 3;
    case "fair":
      return 2;
    case "weak":
      return 1;
    default:
      return 0;
  }
}

/** EMA simple para suavizar saltos de RSSI al caminar. */
export function emaRssi(
  prev: number | null,
  next: number,
  alpha = 0.35,
): number {
  if (prev == null || !Number.isFinite(prev)) return next;
  return alpha * next + (1 - alpha) * prev;
}

export function intensityFromBand(band: BleProximityBand): number {
  return bandRank(band) / 4;
}
