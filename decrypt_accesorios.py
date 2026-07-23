"""
Extrae AirTags locales a JSON.

En este Mac la clave BeaconStore vive en el atributo 'gena' del llavero,
no en el campo password. Por eso `python -m findmy decrypt` falla con
Invalid key size (0). Este script lee gena y usa FindMy.py para exportar.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

from findmy.plist import list_accessories


def get_beaconstore_key() -> bytes:
    result = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-l", "BeaconStore", "-g"],
        capture_output=True,
        text=True,
        check=False,
    )
    blob = result.stdout + "\n" + result.stderr

    # Preferir password (-w style) si existe
    for line in result.stderr.splitlines():
        if line.lower().startswith("password:"):
            value = line.split(":", 1)[1].strip().strip('"')
            if value:
                try:
                    return bytes.fromhex(value)
                except ValueError:
                    return value.encode()

    match = re.search(r'"gena"<blob>=0x([0-9A-Fa-f]+)', blob)
    if not match:
        raise RuntimeError(
            "No se pudo leer BeaconStore del llavero. "
            "Abre Acceso a Llaveros y permite el acceso si macOS lo pide."
        )
    key = bytes.fromhex(match.group(1))
    if len(key) not in (16, 24, 32):
        raise RuntimeError(f"Clave BeaconStore con tamaño invalido: {len(key)} bytes")
    return key


def main() -> int:
    parser = argparse.ArgumentParser(description="Decrypt Find My accessories to JSON")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("accesorios"),
        help="Carpeta de salida (default: accesorios/)",
    )
    args = parser.parse_args()

    key = get_beaconstore_key()
    accessories = list_accessories(key=key)
    if not accessories:
        print("No se encontraron accesorios Find My.", file=sys.stderr)
        return 1

    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    # Quitar JSON vacios/rotos de intentos anteriores
    for stale in out_dir.glob("*.json"):
        if stale.stat().st_size == 0:
            stale.unlink()

    exported = []
    for acc in accessories:
        path = out_dir / f"{acc.identifier}.json"
        exported.append(acc.to_json(path))
        print(f"OK: {acc.name or acc.identifier} -> {path.name}")

    print(f"\n{len(exported)} accesorio(s) en {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
