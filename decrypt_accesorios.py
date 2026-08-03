"""
Extrae AirTags locales y los acumula en accesorios/accesorios.json.

Flujo multi-cuenta:
  1. Inicia sesion iCloud A en el Mac
  2. python decrypt_accesorios.py --cuenta correoA@icloud.com
  3. Cierra sesion / cambia a cuenta B
  4. python decrypt_accesorios.py --cuenta correoB@icloud.com
  Los accesorios se van sumando (por UUID) sin borrar los anteriores.

En este Mac la clave BeaconStore vive en 'gena' del llavero, no en password.
"""

from __future__ import annotations

import argparse
import json
import plistlib
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from findmy.plist import list_accessories

MASTER_NAME = "accesorios.json"
MOBILE_ME_PLIST = Path.home() / "Library/Preferences/MobileMeAccounts.plist"


def get_beaconstore_key() -> bytes:
    result = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-l", "BeaconStore", "-g"],
        capture_output=True,
        text=True,
        check=False,
    )
    blob = result.stdout + "\n" + result.stderr

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


def list_icloud_accounts() -> list[str]:
    if not MOBILE_ME_PLIST.is_file():
        return []
    try:
        data = plistlib.loads(MOBILE_ME_PLIST.read_bytes())
    except Exception:
        return []
    accounts = data.get("Accounts") or []
    emails: list[str] = []
    for acc in accounts:
        email = acc.get("AccountID") or acc.get("AccountDescription")
        if email:
            emails.append(str(email))
    return emails


def resolve_account_label(explicit: str | None) -> str:
    if explicit:
        return explicit.strip()
    found = list_icloud_accounts()
    if len(found) == 1:
        return found[0]
    if len(found) > 1:
        print(
            "Hay varias cuentas iCloud en este Mac. Indica cual estas exportando:",
            file=sys.stderr,
        )
        for email in found:
            print(f"  - {email}", file=sys.stderr)
        print("Usa: python decrypt_accesorios.py --cuenta EMAIL", file=sys.stderr)
        raise SystemExit(2)
    return "desconocida"


def load_master(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return []
    data = json.loads(raw)
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        return [data]
    return []


def load_loose_jsons(out_dir: Path, master_path: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in sorted(out_dir.glob("*.json")):
        if path.resolve() == master_path.resolve():
            continue
        raw = path.read_text(encoding="utf-8").strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and data.get("type") == "accessory":
            items.append(data)
        elif isinstance(data, list):
            items.extend(x for x in data if isinstance(x, dict) and x.get("type") == "accessory")
    return items


def merge_by_identifier(
    existing: list[dict[str, Any]],
    incoming: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int, int]:
    by_id: dict[str, dict[str, Any]] = {}
    for item in existing:
        ident = item.get("identifier")
        if ident:
            by_id[str(ident)] = item

    added = 0
    updated = 0
    for item in incoming:
        ident = item.get("identifier")
        if not ident:
            continue
        ident = str(ident)
        if ident in by_id:
            prev = by_id[ident]
            # Conservar etiqueta de cuenta anterior si la nueva no trae una util
            if not item.get("icloud_account") and prev.get("icloud_account"):
                item["icloud_account"] = prev["icloud_account"]
            if prev.get("imported_at") and not item.get("first_imported_at"):
                item["first_imported_at"] = prev.get("first_imported_at") or prev["imported_at"]
            elif prev.get("first_imported_at"):
                item["first_imported_at"] = prev["first_imported_at"]
            by_id[ident] = item
            updated += 1
        else:
            item.setdefault("first_imported_at", item.get("imported_at"))
            by_id[ident] = item
            added += 1

    return list(by_id.values()), added, updated


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Decrypt Find My accessories and accumulate them into accesorios.json",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("accesorios"),
        help="Carpeta de salida (default: accesorios/)",
    )
    parser.add_argument(
        "--cuenta",
        type=str,
        default=None,
        help="Email iCloud de la cuenta que estas exportando ahora",
    )
    parser.add_argument(
        "--solo-archivo",
        action="store_true",
        help="Solo actualizar accesorios.json (no escribir un JSON por UUID)",
    )
    args = parser.parse_args()

    cuenta = resolve_account_label(args.cuenta)
    now = datetime.now(timezone.utc).isoformat()

    key = get_beaconstore_key()
    accessories = list_accessories(key=key)
    if not accessories:
        print("No se encontraron accesorios Find My en la cuenta activa del Mac.", file=sys.stderr)
        return 1

    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    master_path = out_dir / MASTER_NAME

    for stale in out_dir.glob("*.json"):
        if stale.stat().st_size == 0:
            stale.unlink()

    existing = load_master(master_path)
    # Migrar JSON sueltos antiguos al archivo maestro
    existing, migrated_add, _ = merge_by_identifier(existing, load_loose_jsons(out_dir, master_path))
    if migrated_add:
        print(f"Migrados {migrated_add} JSON sueltos hacia {master_path.name}")

    incoming: list[dict[str, Any]] = []
    for acc in accessories:
        payload = acc.to_json()
        payload["icloud_account"] = cuenta
        payload["imported_at"] = now
        incoming.append(payload)
        name = acc.name or acc.identifier
        print(f"OK: {name} [{cuenta}]")

    merged, added, updated = merge_by_identifier(existing, incoming)
    merged.sort(key=lambda x: (str(x.get("icloud_account") or ""), str(x.get("name") or ""), str(x.get("identifier") or "")))

    master_path.write_text(
        json.dumps(merged, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    if not args.solo_archivo:
        for item in incoming:
            ident = item.get("identifier")
            if not ident:
                continue
            (out_dir / f"{ident}.json").write_text(
                json.dumps(item, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

    print(
        f"\nCuenta: {cuenta}\n"
        f"Esta pasada: {len(incoming)} | nuevos: {added} | actualizados: {updated}\n"
        f"Total acumulado: {len(merged)} -> {master_path}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
