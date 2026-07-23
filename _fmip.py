"""Ubicaciones en vivo de dispositivos propios via Find My iPhone (FMIP / pyicloud)."""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

COOKIE_DIR = Path(".pyicloud")


def _load_icloud_credentials(store_path: str = "account.json") -> tuple[str, str]:
    data = json.loads(Path(store_path).read_text(encoding="utf-8"))
    account = data.get("account") or {}
    user = account.get("username")
    password = account.get("password")
    if not user or not password:
        raise RuntimeError(
            "No hay usuario/clave iCloud en account.json. "
            "Vuelve a iniciar sesion con FindMy.py primero."
        )
    return user, password


def _complete_2fa(api) -> None:
    if getattr(api, "requires_2fa", False):
        print("Autenticacion 2FA requerida (codigo del dispositivo de confianza).")
        code = input("Codigo 2FA? > ").strip()
        if not api.validate_2fa_code(code):
            raise RuntimeError("Codigo 2FA invalido")
        if not api.is_trusted_session:
            api.trust_session()
        return

    if getattr(api, "requires_2sa", False):
        devices = api.trusted_devices
        print("Autenticacion 2SA requerida. Dispositivos:")
        for i, device in enumerate(devices):
            label = device.get("deviceName") or device.get("phoneNumber") or str(device)
            print(f"  {i} - {label}")
        ind = int(input("Dispositivo? > "))
        device = devices[ind]
        if not api.send_verification_code(device):
            raise RuntimeError("No se pudo enviar el codigo")
        code = input("Codigo? > ").strip()
        if not api.validate_verification_code(device, code):
            raise RuntimeError("Codigo 2SA invalido")


def get_fmip_api(store_path: str = "account.json"):
    from pyicloud import PyiCloudService

    user, password = _load_icloud_credentials(store_path)
    COOKIE_DIR.mkdir(exist_ok=True)
    api = PyiCloudService(user, password, cookie_directory=str(COOKIE_DIR))
    try:
        api.devices.refresh(locate=True)
    except Exception:  # noqa: BLE001
        if getattr(api, "requires_2fa", False) or getattr(api, "requires_2sa", False):
            _complete_2fa(api)
            api = PyiCloudService(user, password, cookie_directory=str(COOKIE_DIR))
            api.devices.refresh(locate=True)
        else:
            raise
    return api


def _battery_label(level) -> str:
    if level is None:
        return "Desconocida"
    try:
        pct = float(level) * 100
    except (TypeError, ValueError):
        return "Desconocida"
    if pct >= 80:
        return f"Completa ({pct:.0f}%)"
    if pct >= 40:
        return f"Media ({pct:.0f}%)"
    if pct >= 15:
        return f"Baja ({pct:.0f}%)"
    return f"Muy baja ({pct:.0f}%)"


def fetch_fmip_locations(api=None, store_path: str = "account.json") -> list[dict]:
    """Devuelve ubicaciones en vivo de dispositivos vinculados a la cuenta."""
    if api is None:
        api = get_fmip_api(store_path)
    else:
        api.devices.refresh(locate=True)

    rows: list[dict] = []
    for device in api.devices:
        content = getattr(device, "content", None) or getattr(device, "data", None) or {}
        if not isinstance(content, dict):
            continue
        name = content.get("name") or content.get("deviceDisplayName") or "Dispositivo"
        loc = content.get("location")
        if not loc or loc.get("latitude") is None or loc.get("longitude") is None:
            rows.append(
                {
                    "name": name,
                    "found": False,
                    "source": "fmip",
                    "model": content.get("deviceDisplayName") or content.get("deviceClass"),
                }
            )
            continue

        ts_ms = loc.get("timeStamp")
        if ts_ms:
            timestamp = datetime.fromtimestamp(ts_ms / 1000).astimezone().isoformat()
        else:
            timestamp = datetime.now().astimezone().isoformat()

        rows.append(
            {
                "name": name,
                "found": True,
                "source": "fmip",
                "model": content.get("deviceDisplayName") or content.get("deviceClass"),
                "latitude": float(loc["latitude"]),
                "longitude": float(loc["longitude"]),
                "battery": _battery_label(content.get("batteryLevel")),
                "timestamp": timestamp,
                "accuracy_m": int(float(loc.get("horizontalAccuracy") or 0)),
                "confidence": 0 if loc.get("isInaccurate") else 3,
                "position_type": loc.get("positionType") or "",
                "is_old": bool(loc.get("isOld")),
            }
        )
    return rows


if __name__ == "__main__":
    try:
        devices = fetch_fmip_locations()
    except Exception as exc:  # noqa: BLE001
        print(f"Error FMIP: {exc}", file=sys.stderr)
        sys.exit(1)
    for row in devices:
        if row["found"]:
            print(
                f"{row['name']}: {row['latitude']}, {row['longitude']} "
                f"({row['battery']}) @ {row['timestamp']}"
            )
        else:
            print(f"{row['name']}: sin ubicacion FMIP")
