"""
Consulta la ubicacion de AirTags (u otros accesorios Find My) vinculados a tu cuenta iCloud.

Requisito: archivos JSON con las claves de cada accesorio (no se pueden listar solo con iCloud).
En Mac: python -m findmy decrypt > accesorios.json
Ver: https://github.com/malmeloo/FindMy.py/tree/main/examples
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from _login import get_account_sync
from findmy import FindMyAccessory, FixedRollingKeyPairAccessory

DEFAULT_STORE_PATH = "account.json"
ANISETTE_SERVER = None
ANISETTE_LIBS_PATH = "ani_libs.bin"

BATTERY_LEVEL = {0b00: "Completa", 0b01: "Media", 0b10: "Baja", 0b11: "Muy baja"}

logging.basicConfig(level=logging.INFO)


def get_battery_level(status: int) -> str:
    battery_id = (status >> 6) & 0b11
    return BATTERY_LEVEL.get(battery_id, "Desconocida")


def get_airtag_name(airtag, path: Path) -> str:
    if isinstance(airtag, (FindMyAccessory, FixedRollingKeyPairAccessory)):
        if airtag.name:
            return airtag.name
        if airtag.identifier:
            return airtag.identifier
    return path.stem


def load_accessories_from_paths(paths: list[Path]) -> list[tuple[object, Path]]:
    accessories: list[tuple[object, Path]] = []
    for path in paths:
        if path.suffix.lower() == ".json" and path.is_file():
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                for i, item in enumerate(data):
                    acc = FindMyAccessory.from_json(item)
                    accessories.append((acc, path.with_name(f"{path.stem}_{i}.json")))
            else:
                accessories.append((FindMyAccessory.from_json(path), path))
        else:
            accessories.append((FindMyAccessory.from_json(path), path))
    return accessories


def main(airtag_paths: list[Path], store_path: str) -> int:
    if not airtag_paths:
        print("No hay archivos JSON de accesorios.", file=sys.stderr)
        print("Coloca los .json en la carpeta 'accesorios/' o pasa rutas como argumentos.", file=sys.stderr)
        return 1

    pairs = load_accessories_from_paths(airtag_paths)
    airtags = [a for a, _ in pairs]
    path_by_tag = {id(a): p for a, p in pairs}

    acc = get_account_sync(store_path, ANISETTE_SERVER, ANISETTE_LIBS_PATH)
    print(f"Sesion iCloud: {acc.account_name} ({acc.first_name} {acc.last_name})")

    locations = acc.fetch_location(airtags)

    print("\nUltimas ubicaciones conocidas:")
    for airtag, path in pairs:
        location = locations.get(airtag)
        name = get_airtag_name(airtag, path)
        if location:
            battery = get_battery_level(location.status)
            print(f"  - {name}: lat={location.latitude}, lon={location.longitude} ({battery})")
        else:
            print(f"  - {name}: sin ubicacion en la red Find My")

    acc.to_json(store_path)
    for airtag, path in pairs:
        if isinstance(airtag, (FindMyAccessory, FixedRollingKeyPairAccessory)):
            airtag.to_json(path)

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Obtiene ubicaciones de AirTags usando FindMy.py e iCloud.",
    )
    parser.add_argument(
        "airtag_paths",
        type=Path,
        nargs="*",
        help="Archivos JSON de accesorios (o carpeta accesorios/ por defecto)",
    )
    parser.add_argument(
        "--store-path",
        type=str,
        default=DEFAULT_STORE_PATH,
        help=f"Archivo de sesion iCloud (default: {DEFAULT_STORE_PATH})",
    )
    args = parser.parse_args()

    paths = list(args.airtag_paths)
    if not paths:
        acc_dir = Path("accesorios")
        if acc_dir.is_dir():
            paths = sorted(acc_dir.glob("*.json"))

    sys.exit(main(paths, args.store_path))
