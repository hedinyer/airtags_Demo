import { promises as fs } from "fs";
import path from "path";

import { chasisAliasDePlaca } from "@/lib/chasisPlaca";
import type { DeviceKeyring } from "@/lib/ble/types";

type KeyringFile = {
  generated_at?: string;
  name: string;
  id: string;
  nearby: string[];
  suffix: string[];
};

function normalizeKey(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Rutas hardcodeadas / fallbacks (sin secrets remotos). */
function candidateDirs(): string[] {
  const cwd = process.cwd();
  return [
    process.env.BLE_KEYRING_DIR?.trim(),
    path.join(cwd, "private", "ble-keyring"),
    path.join(cwd, "web", "private", "ble-keyring"),
    path.join(cwd, "..", "web", "private", "ble-keyring"),
  ].filter(Boolean) as string[];
}

async function readJsonFile(filePath: string): Promise<KeyringFile | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as KeyringFile;
  } catch {
    return null;
  }
}

const cache = new Map<string, { at: number; data: DeviceKeyring }>();
const CACHE_MS = 60_000;

export async function loadDeviceKeyring(
  targetName: string,
): Promise<DeviceKeyring | null> {
  const nameKey = normalizeKey(targetName);
  if (!nameKey) return null;

  const hit = cache.get(nameKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const aliasChasis = chasisAliasDePlaca(nameKey);
  const candidates = aliasChasis ? [nameKey, aliasChasis] : [nameKey];

  let file: KeyringFile | null = null;
  for (const dir of candidateDirs()) {
    for (const stem of candidates) {
      file = await readJsonFile(path.join(dir, `${stem}.json`));
      if (file) break;
    }
    if (file) break;
  }

  if (!file || (!file.suffix?.length && !file.nearby?.length)) return null;

  const data: DeviceKeyring = {
    name: file.name || targetName,
    id: file.id || "",
    nearby: (file.nearby || []).map((s) => s.toLowerCase()),
    suffix: (file.suffix || []).map((s) => s.toLowerCase()),
  };
  cache.set(nameKey, { at: Date.now(), data });
  return data;
}

export { normalizeKey as normalizeBleTargetName };
