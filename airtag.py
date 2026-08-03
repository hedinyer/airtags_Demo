"""
Consulta la ubicacion de AirTags (u otros accesorios Find My).

<<<<<<< HEAD
Requisito: archivos JSON con las claves de cada accesorio (no se pueden listar solo con iCloud).
En Mac: python -m findmy decrypt > accesorios.json
Ver: https://github.com/malmeloo/FindMy.py/tree/main/examples

Uso en vivo:
  python airtag.py --watch
=======
Usa por defecto accesorios/accesorios.json (archivo acumulado multi-cuenta).
Puedes pasar JSON individuales o una carpeta como argumentos.
>>>>>>> origin/main
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import threading
import time
import webbrowser
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
<<<<<<< HEAD
import unicodedata
=======
from typing import Any
>>>>>>> origin/main

from _fmip import fetch_fmip_locations, get_fmip_api
from _login import get_account_sync
from findmy import FindMyAccessory

DEFAULT_STORE_PATH = "account.json"
DEFAULT_MASTER = Path("accesorios") / "accesorios.json"
ANISETTE_SERVER = None
ANISETTE_LIBS_PATH = "ani_libs.bin"
LOCATIONS_PATH = Path("locations.json")
MAP_PATH = Path("mapa.html")
LOOKBACK_DAYS = 7
DEFAULT_INTERVAL_S = 15
DEFAULT_PORT = 8765

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


<<<<<<< HEAD
def fix_stale_alignment(accessory: FindMyAccessory, lookback_days: int = LOOKBACK_DAYS) -> None:
    """Evita barrer anos de claves cuando alignment_date esta muy atrasado."""
    now = datetime.now().astimezone()
    window_start = now - timedelta(days=lookback_days)
    align_date = accessory._alignment_date
    if align_date.tzinfo is None:
        align_date = align_date.astimezone()
    if align_date >= window_start:
        return
    delta = (window_start - align_date) // accessory.interval
    accessory._alignment_date = window_start
    accessory._alignment_index = accessory._alignment_index + delta


def load_accessories_from_paths(paths: list[Path]) -> list[tuple[object, Path]]:
    accessories: list[tuple[object, Path]] = []
=======
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

>>>>>>> origin/main
    for path in paths:
        if path.suffix.lower() != ".json" or not path.is_file():
            continue
        for item in load_json_file(path):
            if item.get("type") != "accessory":
                continue
<<<<<<< HEAD
            data = json.loads(raw)
            if isinstance(data, list):
                for i, item in enumerate(data):
                    acc = FindMyAccessory.from_json(item)
                    if isinstance(acc, FindMyAccessory):
                        fix_stale_alignment(acc)
                    accessories.append((acc, path.with_name(f"{path.stem}_{i}.json")))
            else:
                acc = FindMyAccessory.from_json(path)
                if isinstance(acc, FindMyAccessory):
                    fix_stale_alignment(acc)
                accessories.append((acc, path))
        else:
            acc = FindMyAccessory.from_json(path)
            if isinstance(acc, FindMyAccessory):
                fix_stale_alignment(acc)
            accessories.append((acc, path))
    return accessories


def collect_locations(pairs: list[tuple[object, Path]], locations: dict) -> list[dict]:
    rows: list[dict] = []
    for airtag, path in pairs:
        location = locations.get(airtag)
        name = get_airtag_name(airtag, path)
        if not location:
            rows.append({"name": name, "found": False, "source": "offline"})
            continue
        rows.append(
            {
                "name": name,
                "found": True,
                "source": "offline",
                "latitude": location.latitude,
                "longitude": location.longitude,
                "battery": get_battery_level(location.status),
                "timestamp": location.timestamp.isoformat(),
                "accuracy_m": location.horizontal_accuracy,
                "confidence": location.confidence,
            }
        )
    return rows


def _norm_name(name: str | None) -> str:
    if not name:
        return ""
    cleaned = unicodedata.normalize("NFKC", name)
    cleaned = (
        cleaned.replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("`", "'")
        .strip()
        .lower()
    )
    return " ".join(cleaned.split())


def _device_key(row: dict) -> str:
    """Clave estable para unificar el mismo dispositivo entre fuentes."""
    name = _norm_name(row.get("name"))
    model = _norm_name(row.get("model"))
    if name:
        if len(name) >= 32 and name.count("-") >= 4:
            return f"uuid:{name}"
        return f"name:{name}"
    if model:
        return f"model:{model}"
    return f"anon:{id(row)}"


def _parse_ts(row: dict) -> datetime:
    raw = row.get("timestamp")
    if not raw:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def merge_locations(fmip_rows: list[dict], offline_rows: list[dict]) -> list[dict]:
    """Hibrido: un dispositivo = la ubicacion con timestamp mas reciente de ambas fuentes."""
    best: dict[str, dict] = {}

    def consider(row: dict) -> None:
        key = _device_key(row)
        prev = best.get(key)
        if prev is None:
            best[key] = row
            return
        if row.get("found") and not prev.get("found"):
            best[key] = row
            return
        if not row.get("found"):
            return
        # Empate: preferir FMIP si es el mismo instante
        if _parse_ts(row) > _parse_ts(prev):
            best[key] = row
        elif _parse_ts(row) == _parse_ts(prev) and row.get("source") == "fmip":
            best[key] = row

    for row in fmip_rows:
        consider(row)
    for row in offline_rows:
        consider(row)

    has_iphone = any(
        r.get("found") and _norm_name(r.get("name")) == "iphone" for r in best.values()
    )
    rows = []
    for key, row in best.items():
        if has_iphone and key.startswith("uuid:") and not row.get("found"):
            continue
        rows.append(row)

    rows.sort(
        key=lambda r: (
            not r.get("found"),
            r.get("source") != "fmip",
            _norm_name(r.get("name")),
        )
    )
    return rows


def save_snapshot(rows: list[dict], out_path: Path = LOCATIONS_PATH) -> dict:
    payload = {
        "updated_at": datetime.now().astimezone().isoformat(),
        "devices": rows,
    }
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return payload


def write_live_map(out_path: Path = MAP_PATH) -> None:
    html = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AirTags — en vivo</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    :root {
      --ink: #111827;
      --muted: #6b7280;
      --panel: rgba(255,255,255,0.94);
      --accent: #0f766e;
      --live: #059669;
      --stale: #b45309;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: "Segoe UI", system-ui, sans-serif; color: var(--ink); }
    #map { position: absolute; inset: 0; }
    .panel {
      position: absolute; z-index: 1000; top: 16px; left: 16px; right: 16px;
      max-width: 380px; background: var(--panel); backdrop-filter: blur(8px);
      border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; padding: 14px 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.12);
    }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .panel h1 { margin: 0; font-size: 1.1rem; }
    .live {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 0.75rem; font-weight: 600; color: var(--live);
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .live::before {
      content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--live);
      box-shadow: 0 0 0 0 rgba(5,150,105,0.55);
      animation: pulse 1.6s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(5,150,105,0.55); }
      70% { box-shadow: 0 0 0 8px rgba(5,150,105,0); }
      100% { box-shadow: 0 0 0 0 rgba(5,150,105,0); }
    }
    .panel p { margin: 6px 0 10px; color: var(--muted); font-size: 0.85rem; }
    .device {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;
      padding: 8px 0; border-top: 1px solid rgba(0,0,0,0.06); font-size: 0.9rem;
    }
    .meta { color: var(--muted); font-size: 0.78rem; margin-top: 2px; }
    .meta.stale { color: var(--stale); }
    .badge {
      display: inline-block; font-size: 0.68rem; font-weight: 700;
      padding: 1px 6px; border-radius: 999px; margin-left: 6px;
      vertical-align: middle; text-transform: uppercase; letter-spacing: 0.03em;
    }
    .badge.fmip { background: #d1fae5; color: #065f46; }
    .badge.offline { background: #e5e7eb; color: #374151; }
    .device button {
      border: 0; background: var(--accent); color: white; border-radius: 8px;
      padding: 4px 10px; cursor: pointer; font-size: 0.8rem; flex-shrink: 0;
    }
    .device button:disabled { opacity: 0.45; cursor: default; background: #9ca3af; }
    .missing { color: var(--muted); }
    .leaflet-popup-content { margin: 10px 12px; line-height: 1.35; }
  </style>
</head>
<body>
  <div id="map"></div>
  <aside class="panel">
    <div class="head">
      <h1>Dispositivos en vivo</h1>
      <span class="live">Live</span>
    </div>
    <p id="summary">Conectando…</p>
    <div id="list"></div>
  </aside>
  <script>
    const map = L.map('map', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    map.setView([7.09, -73.12], 12);

    const markers = new Map();
    let fittedOnce = false;

    function relTime(iso) {
      if (!iso) return '—';
      const ms = Date.now() - new Date(iso).getTime();
      if (ms < 0) return 'ahora';
      const s = Math.round(ms / 1000);
      if (s < 60) return `hace ${s}s`;
      const m = Math.round(s / 60);
      if (m < 60) return `hace ${m} min`;
      const h = Math.round(m / 60);
      if (h < 48) return `hace ${h} h`;
      return `hace ${Math.round(h / 24)} d`;
    }

    function ageClass(iso) {
      if (!iso) return 'stale';
      const min = (Date.now() - new Date(iso).getTime()) / 60000;
      return min > 30 ? 'stale' : '';
    }

    function render(data) {
      const devices = data.devices || [];
      const found = devices.filter(d => d.found);
      const updated = relTime(data.updated_at);
      document.getElementById('summary').textContent =
        `${found.length} con ubicacion / ${devices.length} · consulta ${updated}`;

      const list = document.getElementById('list');
      list.innerHTML = '';
      const bounds = [];
      const seen = new Set();

      devices.forEach((d) => {
        const key = d.name;
        seen.add(key);
        const row = document.createElement('div');
        row.className = 'device';

        if (!d.found) {
          if (markers.has(key)) {
            map.removeLayer(markers.get(key));
            markers.delete(key);
          }
          row.innerHTML = `<span class="missing">${d.name} — sin ubicacion</span><button disabled>Ver</button>`;
          list.appendChild(row);
          return;
        }

        const when = relTime(d.timestamp);
        const stale = ageClass(d.timestamp);
        const src = d.source === 'fmip' ? 'En vivo' : 'Red Find My';
        const badgeClass = d.source === 'fmip' ? 'fmip' : 'offline';
        const popup =
          `<strong>${d.name}</strong><br>${src}<br>Bateria: ${d.battery}<br>` +
          `Visto: ${when}<br>Precision: ~${d.accuracy_m} m`;

        let marker = markers.get(key);
        if (!marker) {
          marker = L.marker([d.latitude, d.longitude]).addTo(map);
          markers.set(key, marker);
        } else {
          marker.setLatLng([d.latitude, d.longitude]);
        }
        marker.bindPopup(popup);
        bounds.push([d.latitude, d.longitude]);

        row.innerHTML =
          `<div><div>${d.name} · ${d.battery}` +
          `<span class="badge ${badgeClass}">${src}</span></div>` +
          `<div class="meta ${stale}">visto ${when}</div></div>`;
        const btn = document.createElement('button');
        btn.textContent = 'Ver';
        btn.onclick = () => {
          map.setView([d.latitude, d.longitude], 16);
          marker.openPopup();
        };
        row.appendChild(btn);
        list.appendChild(row);
      });

      for (const key of [...markers.keys()]) {
        if (!seen.has(key)) {
          map.removeLayer(markers.get(key));
          markers.delete(key);
        }
      }

      if (!fittedOnce && bounds.length) {
        if (bounds.length === 1) map.setView(bounds[0], 15);
        else map.fitBounds(bounds, { padding: [48, 48] });
        fittedOnce = true;
      }
    }

    async function tick() {
      try {
        const res = await fetch('locations.json?ts=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        render(await res.json());
      } catch (err) {
        document.getElementById('summary').textContent =
          'Esperando datos del servidor…';
      }
    }

    tick();
    setInterval(tick, 2000);
  </script>
</body>
</html>
"""
    out_path.write_text(html, encoding="utf-8")


def persist_state(acc, store_path: str, pairs: list[tuple[object, Path]]) -> None:
    acc.to_json(store_path)
    for airtag, path in pairs:
        if isinstance(airtag, FindMyAccessory):
            airtag.to_json(path)


def fetch_offline(acc, pairs: list[tuple[object, Path]], quiet: bool = False) -> list[dict]:
    locations: dict = {}
    for airtag, path in pairs:
        name = get_airtag_name(airtag, path)
        if not quiet:
            print(f"  · [red] {name}...", flush=True)
        loc = acc.fetch_location(airtag)
        locations[airtag] = loc
        if not quiet:
            if loc:
                print(
                    f"    OK lat={loc.latitude}, lon={loc.longitude} "
                    f"({get_battery_level(loc.status)}) @ {loc.timestamp.isoformat()}",
                    flush=True,
                )
            else:
                print("    sin ubicacion en la red Find My", flush=True)
    return collect_locations(pairs, locations)


def fetch_all(
    acc,
    pairs: list[tuple[object, Path]],
    fmip_api=None,
    store_path: str = DEFAULT_STORE_PATH,
    quiet: bool = False,
) -> list[dict]:
    """Consulta FMIP + red Find My y se queda con la ubicacion mas reciente por dispositivo."""
    fmip_rows: list[dict] = []
    if not quiet:
        print("  · [en vivo] dispositivos iCloud...", flush=True)
    try:
        fmip_rows = fetch_fmip_locations(api=fmip_api, store_path=store_path)
        if not quiet:
            for row in fmip_rows:
                if row["found"]:
                    print(
                        f"    OK {row['name']}: lat={row['latitude']}, lon={row['longitude']} "
                        f"({row['battery']}) @ {row['timestamp']}",
                        flush=True,
                    )
                else:
                    print(f"    {row['name']}: sin ubicacion FMIP", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"    Aviso FMIP: {exc}", file=sys.stderr, flush=True)

    offline_rows = fetch_offline(acc, pairs, quiet=quiet)
    merged = merge_locations(fmip_rows, offline_rows)

    if not quiet:
        print("  · [hibrido] ubicacion mas reciente por dispositivo:", flush=True)
        for row in merged:
            if row.get("found"):
                src = "en vivo" if row.get("source") == "fmip" else "red Find My"
                print(
                    f"    = {row['name']}: {src} @ {row['timestamp']} "
                    f"({row['latitude']}, {row['longitude']})",
                    flush=True,
                )
            else:
                print(f"    = {row['name']}: sin ubicacion", flush=True)
    return merged


class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def start_http_server(port: int, root: Path) -> ThreadingHTTPServer:
    handler = partial(_QuietHandler, directory=str(root))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def run_once(pairs, store_path: str, open_map: bool) -> int:
    acc = get_account_sync(store_path, ANISETTE_SERVER, ANISETTE_LIBS_PATH)
    print(f"Sesion iCloud: {acc.account_name} ({acc.first_name} {acc.last_name})")
    print("\nConsultando ubicaciones (FMIP + red Find My)...")
    fmip_api = None
    try:
        fmip_api = get_fmip_api(store_path)
    except Exception as exc:  # noqa: BLE001
        print(f"Aviso: no se pudo iniciar FMIP ({exc}). Solo red Find My.", file=sys.stderr)
    rows = fetch_all(acc, pairs, fmip_api=fmip_api, store_path=store_path)
    save_snapshot(rows)
    write_live_map(MAP_PATH)
    persist_state(acc, store_path, pairs)
    print(f"\nMapa: {MAP_PATH.resolve()}")
    print(f"Datos: {LOCATIONS_PATH.resolve()}")
    if open_map:
        webbrowser.open(MAP_PATH.resolve().as_uri())
    return 0


def run_watch(
    pairs,
    store_path: str,
    interval_s: float,
    port: int,
    open_map: bool,
) -> int:
    logging.getLogger("findmy").setLevel(logging.WARNING)
    logging.getLogger("http.server").setLevel(logging.WARNING)
    logging.getLogger("pyicloud").setLevel(logging.WARNING)

    acc = get_account_sync(store_path, ANISETTE_SERVER, ANISETTE_LIBS_PATH)
    print(f"Sesion iCloud: {acc.account_name} ({acc.first_name} {acc.last_name})")
    fmip_api = None
    try:
        fmip_api = get_fmip_api(store_path)
        print("FMIP listo (ubicacion en vivo de dispositivos propios).")
    except Exception as exc:  # noqa: BLE001
        print(f"Aviso: FMIP no disponible ({exc}). Solo red Find My.", file=sys.stderr)
    print(
        f"Modo en vivo: consultando cada {interval_s:.0f}s "
        f"(Ctrl+C para salir)\n"
    )

    write_live_map(MAP_PATH)
    if not LOCATIONS_PATH.exists():
        save_snapshot([])

    root = Path.cwd()
    server = start_http_server(port, root)
    url = f"http://127.0.0.1:{port}/mapa.html"
    print(f"Mapa en vivo: {url}")
    if open_map:
        webbrowser.open(url)

    try:
        while True:
            started = time.monotonic()
            stamp = datetime.now().astimezone().strftime("%H:%M:%S")
            print(f"[{stamp}] Actualizando (hibrido)...", flush=True)
            try:
                rows = fetch_all(
                    acc,
                    pairs,
                    fmip_api=fmip_api,
                    store_path=store_path,
                    quiet=False,
                )
                save_snapshot(rows)
                persist_state(acc, store_path, pairs)
                found = sum(1 for r in rows if r["found"])
                live = sum(1 for r in rows if r.get("found") and r.get("source") == "fmip")
                print(
                    f"  -> {found}/{len(rows)} dispositivos "
                    f"({live} en vivo / {found - live} red Find My)\n",
                    flush=True,
                )
            except Exception as exc:  # noqa: BLE001 — seguir el bucle en vivo
                print(f"  Error al consultar: {exc}", file=sys.stderr, flush=True)

            elapsed = time.monotonic() - started
            time.sleep(max(0.0, interval_s - elapsed))
    except KeyboardInterrupt:
        print("\nDetenido.")
    finally:
        server.shutdown()
    return 0


def main(
    airtag_paths: list[Path],
    store_path: str,
    open_map: bool = True,
    watch: bool = False,
    interval_s: float = DEFAULT_INTERVAL_S,
    port: int = DEFAULT_PORT,
) -> int:
=======
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
>>>>>>> origin/main
    if not airtag_paths:
        print("No hay archivos JSON de accesorios.", file=sys.stderr)
        print(
            "Corre primero: python decrypt_accesorios.py --cuenta tu@email.com",
            file=sys.stderr,
        )
        return 1

    pairs = load_accessories_from_paths(airtag_paths)
<<<<<<< HEAD
    if watch:
        return run_watch(pairs, store_path, interval_s, port, open_map)
    return run_once(pairs, store_path, open_map)
=======
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
>>>>>>> origin/main


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
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="No abrir el mapa en el navegador",
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Actualiza ubicaciones en bucle y sirve el mapa en vivo",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL_S,
        help=f"Segundos entre consultas en --watch (default: {DEFAULT_INTERVAL_S})",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"Puerto HTTP del mapa en vivo (default: {DEFAULT_PORT})",
    )
    args = parser.parse_args()

<<<<<<< HEAD
    paths = list(args.airtag_paths)
    if not paths:
        acc_dir = Path("accesorios")
        if acc_dir.is_dir():
            paths = sorted(acc_dir.glob("*.json"))

    sys.exit(
        main(
            paths,
            args.store_path,
            open_map=not args.no_open,
            watch=args.watch,
            interval_s=args.interval,
            port=args.port,
        )
    )
=======
    paths = list(args.airtag_paths) if args.airtag_paths else default_paths()
    sys.exit(main(paths, args.store_path))
>>>>>>> origin/main
