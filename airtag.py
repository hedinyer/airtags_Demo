"""
Consulta la ubicacion de AirTags (u otros accesorios Find My).

Usa por defecto accesorios/accesorios.json (archivo acumulado multi-cuenta).
Puedes pasar JSON individuales o una carpeta como argumentos.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

from _login import get_account_sync
from findmy import FindMyAccessory

DEFAULT_STORE_PATH = "account.json"
DEFAULT_MASTER = Path("accesorios") / "accesorios.json"
ANISETTE_SERVER = None
ANISETTE_LIBS_PATH = "ani_libs.bin"

BATTERY_LEVEL = {0b00: "Completa", 0b01: "Media", 0b10: "Baja", 0b11: "Muy baja"}

logging.basicConfig(level=logging.INFO)


def get_battery_level(status: int) -> str:
    battery_id = (status >> 6) & 0b11
    return BATTERY_LEVEL.get(battery_id, "Desconocida")


def accessory_label(item: dict[str, Any], airtag: FindMyAccessory, path: Path) -> str:
    name = airtag.name or item.get("name") or airtag.identifier or path.stem
    cuenta = item.get("icloud_account")
    if cuenta:
        return f"{name} ({cuenta})"
    return str(name)


def load_json_file(path: Path) -> list[dict[str, Any]]:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        print(f"Aviso: se ignora JSON vacio: {path}", file=sys.stderr)
        return []
    data = json.loads(raw)
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        return [data]
    return []


def load_accessories_from_paths(
    paths: list[Path],
) -> list[tuple[FindMyAccessory, Path, dict[str, Any]]]:
    accessories: list[tuple[FindMyAccessory, Path, dict[str, Any]]] = []
    seen: set[str] = set()

    for path in paths:
        if path.suffix.lower() != ".json" or not path.is_file():
            continue
        for item in load_json_file(path):
            if item.get("type") != "accessory":
                continue
            ident = str(item.get("identifier") or "")
            if ident and ident in seen:
                continue
            if ident:
                seen.add(ident)
            acc = FindMyAccessory.from_json(item)
            accessories.append((acc, path, item))
    return accessories


def default_paths() -> list[Path]:
    master = DEFAULT_MASTER
    if master.is_file() and master.stat().st_size > 0:
        return [master]

    acc_dir = Path("accesorios")
    if not acc_dir.is_dir():
        return []
    return sorted(
        p for p in acc_dir.glob("*.json") if p.name != "accesorios.json" and p.stat().st_size > 0
    )


def persist_accessories(
    pairs: list[tuple[FindMyAccessory, Path, dict[str, Any]]],
) -> None:
    """Guarda claves actualizadas sin perder metadatos (cuenta iCloud, fechas)."""
    master = DEFAULT_MASTER
    master_items: dict[str, dict[str, Any]] = {}
    if master.is_file():
        for item in load_json_file(master):
            ident = item.get("identifier")
            if ident:
                master_items[str(ident)] = item

    for airtag, path, meta in pairs:
        if not isinstance(airtag, FindMyAccessory):
            continue
        fresh = airtag.to_json()
        # Conservar campos propios del proyecto
        for key in ("icloud_account", "imported_at", "first_imported_at"):
            if meta.get(key) is not None:
                fresh[key] = meta[key]
        ident = str(fresh.get("identifier") or airtag.identifier or "")
        if ident:
            master_items[ident] = fresh
            per_file = Path("accesorios") / f"{ident}.json"
            per_file.parent.mkdir(parents=True, exist_ok=True)
            per_file.write_text(
                json.dumps(fresh, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
        elif path.suffix.lower() == ".json":
            path.write_text(
                json.dumps(fresh, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

    if master_items:
        master.parent.mkdir(parents=True, exist_ok=True)
        ordered = sorted(
            master_items.values(),
            key=lambda x: (
                str(x.get("icloud_account") or ""),
                str(x.get("name") or ""),
                str(x.get("identifier") or ""),
            ),
        )
        master.write_text(
            json.dumps(ordered, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


def main(airtag_paths: list[Path], store_path: str) -> int:
    if not airtag_paths:
        print("No hay archivos JSON de accesorios.", file=sys.stderr)
        print(
            "Corre primero: python decrypt_accesorios.py --cuenta tu@email.com",
            file=sys.stderr,
        )
        return 1

    pairs = load_accessories_from_paths(airtag_paths)
    if not pairs:
        print("No se pudo cargar ningun accesorio valido.", file=sys.stderr)
        return 1

    airtags = [a for a, _, _ in pairs]

    acc = get_account_sync(store_path, ANISETTE_SERVER, ANISETTE_LIBS_PATH)
    print(f"Sesion iCloud: {acc.account_name} ({acc.first_name} {acc.last_name})")
    print(f"Consultando {len(airtags)} accesorio(s)...")

    locations = acc.fetch_location(airtags)

    print("\nUltimas ubicaciones conocidas:")
    for airtag, path, meta in pairs:
        location = locations.get(airtag)
        name = accessory_label(meta, airtag, path)
        if location:
            battery = get_battery_level(location.status)
            print(f"  - {name}: lat={location.latitude}, lon={location.longitude} ({battery})")
        else:
            print(f"  - {name}: sin ubicacion en la red Find My")

    acc.to_json(store_path)
    persist_accessories(pairs)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Obtiene ubicaciones de AirTags usando FindMy.py e iCloud.",
    )
    parser.add_argument(
        "airtag_paths",
        type=Path,
        nargs="*",
        help="JSON de accesorios (default: accesorios/accesorios.json)",
    )
    parser.add_argument(
        "--store-path",
        type=str,
        default=DEFAULT_STORE_PATH,
        help=f"Archivo de sesion iCloud (default: {DEFAULT_STORE_PATH})",
    )
    args = parser.parse_args()

    paths = list(args.airtag_paths) if args.airtag_paths else default_paths()
    sys.exit(main(paths, args.store_path))
