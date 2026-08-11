"""
Consulta la ubicacion de AirTags (u otros accesorios Find My) via la red Find My.

Requisito: archivos JSON con las claves de cada accesorio (no se pueden listar solo con iCloud).
En Mac: python -m findmy decrypt > accesorios.json
Ver: https://github.com/malmeloo/FindMy.py/tree/main/examples

Uso (mapa en vivo por HTTP local, default):
  python airtag.py

Consulta unica sin servidor:
  python airtag.py --once
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import threading
import time
import webbrowser
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import unicodedata

from _login import get_account_sync
from findmy import FindMyAccessory
from findmy.errors import EmptyResponseError
from findmy.keys import KeyPairType
from findmy.reports.reports import LocationReportsFetcher

DEFAULT_STORE_PATH = "account.json"
DEFAULT_MASTER = Path("accesorios") / "accesorios.json"
# En VPS Linux suele hacer falta Anisette remoto (local ani_libs.bin es frágil fuera de Mac).
# Se leen en runtime para respetar .env / EnvironmentFile de systemd.
def _anisette_server() -> str | None:
    return os.environ.get("ANISETTE_SERVER") or None


def _anisette_libs_path() -> str:
    return os.environ.get("ANISETTE_LIBS_PATH") or "ani_libs.bin"


LOCATIONS_PATH = Path("locations.json")
MAP_PATH = Path("mapa.html")
# Público en Vercel: el HTML lee storage; airtag.py lo sobrescribe cada ciclo vía push.
DEFAULT_PUSH_URL = "https://rpjkwoxqnvwcnlnffudt.supabase.co/functions/v1/push-locations"

# Ventana corta: con alignment fresco basta para coger el ultimo reporte.
LOOKBACK_HOURS = 2.0
# Primer ciclo / tags sin hit: un poco mas amplio.
LOOKBACK_HOURS_DEEP = 12.0
# Objetivo: refrescar la flota ~cada 30s (como la app Find My en iPhone).
DEFAULT_INTERVAL_S = 30.0
DEFAULT_PORT = 8765
MAP_POLL_MS = 500
PERSIST_EVERY_S = 60.0
MAX_KEYS_PER_REQUEST = 290
# Accesorios por HTTP request (varios fetch entries). Mas = menos round-trips.
ACCESSORIES_PER_REQUEST = 37
_REPORT_FETCH_LOCK: asyncio.Lock | None = None

BATTERY_LEVEL = {0b00: "Completa", 0b01: "Media", 0b10: "Baja", 0b11: "Muy baja"}

logging.basicConfig(level=logging.INFO)


def _get_report_lock() -> asyncio.Lock:
    global _REPORT_FETCH_LOCK
    if _REPORT_FETCH_LOCK is None:
        _REPORT_FETCH_LOCK = asyncio.Lock()
    return _REPORT_FETCH_LOCK


def get_battery_level(status: int) -> str:
    battery_id = (status >> 6) & 0b11
    return BATTERY_LEVEL.get(battery_id, "Desconocida")


def get_airtag_name(airtag, path: Path) -> str:
    if isinstance(airtag, FindMyAccessory):
        if airtag.name:
            return airtag.name
        if airtag.identifier:
            return airtag.identifier
    return path.stem


def fix_stale_alignment(accessory: FindMyAccessory, lookback_hours: float = LOOKBACK_HOURS_DEEP) -> None:
    """Evita barrer anos de claves cuando alignment_date esta muy atrasado."""
    now = datetime.now().astimezone()
    window_start = now - timedelta(hours=lookback_hours)
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
    for path in paths:
        if path.suffix.lower() == ".json" and path.is_file():
            raw = path.read_text(encoding="utf-8").strip()
            if not raw:
                print(f"Aviso: se ignora JSON vacio: {path}", file=sys.stderr)
                continue
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
        device_id = ""
        if isinstance(airtag, FindMyAccessory) and airtag.identifier:
            device_id = str(airtag.identifier)
        base = {"name": name, "id": device_id, "found": False, "source": "offline"}
        if not location:
            rows.append(base)
            continue
        rows.append(
            {
                **base,
                "found": True,
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
    """Clave estable por UUID; el nombre puede repetirse entre monedas."""
    device_id = str(row.get("id") or "").strip()
    if device_id:
        return f"id:{device_id.lower()}"
    name = _norm_name(row.get("name"))
    if name:
        if len(name) >= 32 and name.count("-") >= 4:
            return f"uuid:{name}"
        return f"name:{name}"
    model = _norm_name(row.get("model"))
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


def keep_best_locations(previous: list[dict], fresh: list[dict]) -> list[dict]:
    """Conserva la ubicacion mas reciente por dispositivo (no pierdas un hit bueno)."""
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
        if _parse_ts(row) >= _parse_ts(prev):
            best[key] = row

    for row in previous:
        consider(row)
    for row in fresh:
        consider(row)

    # Si ya hay filas con UUID, descarta legado colapsado solo por nombre.
    names_with_id = {
        _norm_name(row.get("name"))
        for row in best.values()
        if str(row.get("id") or "").strip() and _norm_name(row.get("name"))
    }
    if names_with_id:
        best = {
            key: row
            for key, row in best.items()
            if str(row.get("id") or "").strip()
            or _norm_name(row.get("name")) not in names_with_id
        }

    rows = list(best.values())
    rows.sort(key=lambda r: (not r.get("found"), _norm_name(r.get("name"))))
    return rows


def _load_dotenv(path: Path = Path(".env")) -> None:
    """Carga KEY=VAL de .env sin dependencia extra."""
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, val)


def push_snapshot(payload: dict) -> None:
    """Publica el snapshot para que el mapa en Vercel lo lea sin redesplegar."""
    secret = os.environ.get("LOCATIONS_PUSH_SECRET", "").strip()
    if not secret:
        return
    url = os.environ.get("LOCATIONS_PUSH_URL", DEFAULT_PUSH_URL).strip() or DEFAULT_PUSH_URL
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=20) as res:
            res.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:200]
        print(f"  Aviso push remoto HTTP {exc.code}: {detail}", file=sys.stderr, flush=True)
    except URLError as exc:
        print(f"  Aviso push remoto: {exc.reason}", file=sys.stderr, flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"  Aviso push remoto: {exc}", file=sys.stderr, flush=True)


def save_snapshot(rows: list[dict], out_path: Path = LOCATIONS_PATH) -> dict:
    payload = {
        "updated_at": datetime.now().astimezone().isoformat(),
        "devices": rows,
    }
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    push_snapshot(payload)
    return payload


def write_live_map(out_path: Path = MAP_PATH, snapshot: dict | None = None) -> None:
    """Inyecta snapshot en index.html y escribe mapa.html."""
    embedded = "null"
    if snapshot is not None:
        embedded = json.dumps(snapshot, ensure_ascii=False).replace("<", "\\u003c")
    elif LOCATIONS_PATH.is_file():
        try:
            embedded = LOCATIONS_PATH.read_text(encoding="utf-8").replace("<", "\\u003c")
        except OSError:
            embedded = "null"

    template_path = Path("index.html")
    if not template_path.is_file():
        raise FileNotFoundError("Falta index.html (plantilla del mapa)")
    html = template_path.read_text(encoding="utf-8")
    token = "/*__EMBEDDED__*/null"
    if token not in html:
        raise ValueError("index.html sin marcador /*__EMBEDDED__*/null")
    html = html.replace(token, embedded, 1)
    out_path.write_text(html, encoding="utf-8")



def persist_state(acc, store_path: str, pairs: list[tuple[object, Path]]) -> None:
    acc.to_json(store_path)
    for airtag, path in pairs:
        if isinstance(airtag, FindMyAccessory):
            airtag.to_json(path)


def _keys_for_accessory(
    accessory,
    lookback_hours: float,
) -> tuple[list[str], list[str], dict[bytes, tuple[object, int]]]:
    """Claves primary/secondary de un accesorio en la ventana reciente."""
    now = datetime.now().astimezone()
    start_date = now - timedelta(hours=lookback_hours)
    end_date = now

    primary: list[str] = []
    secondary: list[str] = []
    id_to_meta: dict[bytes, tuple[object, int]] = {}
    seen_p: set[str] = set()
    seen_s: set[str] = set()

    cur_index = accessory.get_max_index(end_date)
    min_index = accessory.get_min_index(start_date)
    while cur_index >= min_index:
        for key in accessory.keys_at(cur_index):
            hb = key.hashed_adv_key_bytes
            prev = id_to_meta.get(hb)
            if prev is None or cur_index > prev[1]:
                id_to_meta[hb] = (key, cur_index)
            b64 = key.hashed_adv_key_b64
            if key.key_type == KeyPairType.PRIMARY:
                if b64 not in seen_p:
                    seen_p.add(b64)
                    primary.append(b64)
            elif b64 not in seen_s:
                seen_s.add(b64)
                secondary.append(b64)
        cur_index -= 1

    return primary, secondary, id_to_meta


async def _fetch_locations_batched(
    fetcher: LocationReportsFetcher,
    accessories: list,
    lookback_hours: float,
    accessories_per_request: int = ACCESSORIES_PER_REQUEST,
) -> dict:
    """Varios accesorios por HTTP request (un fetch entry cada uno)."""
    if not accessories:
        return {}

    # Precomputar claves y mapa global hashed -> (accessory, key, index)
    per_acc: list[tuple[object, list[str], list[str]]] = []
    id_to_meta: dict[bytes, tuple[object, object, int]] = {}
    for accessory in accessories:
        primary, secondary, local = _keys_for_accessory(accessory, lookback_hours)
        # Si un accesorio supera el limite, trocear en varios fetch entries.
        if len(primary) > MAX_KEYS_PER_REQUEST or len(secondary) > MAX_KEYS_PER_REQUEST:
            for offset in range(0, max(len(primary), 1), MAX_KEYS_PER_REQUEST):
                p = primary[offset : offset + MAX_KEYS_PER_REQUEST]
                s = secondary if offset == 0 else []
                if p or s:
                    per_acc.append((accessory, p, s))
            for offset in range(MAX_KEYS_PER_REQUEST, len(secondary), MAX_KEYS_PER_REQUEST):
                per_acc.append((accessory, [], secondary[offset : offset + MAX_KEYS_PER_REQUEST]))
        else:
            if primary or secondary:
                per_acc.append((accessory, primary, secondary))
        for hb, (key, index) in local.items():
            prev = id_to_meta.get(hb)
            if prev is None or index > prev[2]:
                id_to_meta[hb] = (accessory, key, index)

    best: dict = {}
    account = fetcher._account

    for i in range(0, len(per_acc), accessories_per_request):
        chunk = per_acc[i : i + accessories_per_request]
        devices = [(p, s) for _, p, s in chunk]
        async with _get_report_lock():
            try:
                raw_reports = await account.fetch_raw_reports(devices)
            except EmptyResponseError:
                raw_reports = []

        for report in raw_reports:
            meta = id_to_meta.get(report.hashed_adv_key_bytes)
            if meta is None:
                continue
            accessory, key, index = meta
            try:
                report.decrypt(key)
            except Exception:  # noqa: BLE001
                continue
            accessory.update_alignment(report.timestamp, index)
            prev = best.get(accessory)
            if prev is None or report.timestamp >= prev.timestamp:
                best[accessory] = report

    return best


def fetch_offline(
    acc,
    pairs: list[tuple[object, Path]],
    quiet: bool = False,
    lookback_hours: float = LOOKBACK_HOURS,
    deep_hours: float = LOOKBACK_HOURS_DEEP,
) -> list[dict]:
    """Consulta toda la flota en pocos requests a la red Find My."""
    airtags = [airtag for airtag, _ in pairs]
    if not airtags:
        return []

    if not quiet:
        print(
            f"  · [red Find My] {len(airtags)} accesorio(s) "
            f"(lote, lookback {lookback_hours:g}h / deep {deep_hours:g}h)...",
            flush=True,
        )

    async_acc = getattr(acc, "_asyncacc", None)
    loop = getattr(acc, "_evt_loop", None)
    if async_acc is None or loop is None:
        if len(airtags) == 1:
            locations = {airtags[0]: acc.fetch_location(airtags[0])}
        else:
            result = acc.fetch_location(airtags)
            locations = result if isinstance(result, dict) else {}
        return collect_locations(pairs, locations)

    fetcher: LocationReportsFetcher = async_acc._reports

    async def _run():
        locations = await _fetch_locations_batched(fetcher, airtags, lookback_hours)
        missing = [a for a in airtags if a not in locations or locations[a] is None]
        if missing and deep_hours > lookback_hours:
            deeper = await _fetch_locations_batched(fetcher, missing, deep_hours)
            locations.update(deeper)
        return locations

    locations = loop.run_until_complete(_run())

    if not quiet:
        for airtag, path in pairs:
            loc = locations.get(airtag)
            name = get_airtag_name(airtag, path)
            if loc:
                print(
                    f"    OK {name}: lat={loc.latitude}, lon={loc.longitude} "
                    f"({get_battery_level(loc.status)}) @ {loc.timestamp.isoformat()}",
                    flush=True,
                )
            else:
                print(f"    {name}: sin ubicacion en la red Find My", flush=True)
    return collect_locations(pairs, locations)


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
    acc = get_account_sync(store_path, _anisette_server(), _anisette_libs_path())
    print(f"Sesion iCloud: {acc.account_name} ({acc.first_name} {acc.last_name})")
    print("\nConsultando ubicaciones (solo red Find My)...")
    rows = fetch_offline(acc, pairs, quiet=False, lookback_hours=LOOKBACK_HOURS_DEEP)
    payload = save_snapshot(rows)
    write_live_map(MAP_PATH, snapshot=payload)
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

    acc = get_account_sync(store_path, _anisette_server(), _anisette_libs_path())
    print(f"Sesion iCloud: {acc.account_name} ({acc.first_name} {acc.last_name})")
    print(
        f"Solo red Find My | ciclo objetivo {interval_s:g}s | "
        f"lookback {LOOKBACK_HOURS:g}h (deep {LOOKBACK_HOURS_DEEP:g}h) | "
        f"mapa cada {MAP_POLL_MS}ms\n"
        "(Ctrl+C para salir)\n"
        "Nota: un AirTag solo se actualiza cuando otro iPhone/Mac cercano lo reporta.\n"
    )

    write_live_map(MAP_PATH)
    latest: list[dict] = []
    if LOCATIONS_PATH.is_file():
        try:
            prev = json.loads(LOCATIONS_PATH.read_text(encoding="utf-8"))
            latest = list(prev.get("devices") or [])
        except (OSError, json.JSONDecodeError):
            latest = []
    if not latest:
        save_snapshot([])

    root = Path.cwd()
    server = start_http_server(port, root)
    url = f"http://127.0.0.1:{port}/index.html"
    print(f"Mapa en vivo: {url}")
    if open_map:
        webbrowser.open(url)

    last_persist = 0.0
    cycle = 0

    def publish(tag: str, rows: list[dict], elapsed: float) -> None:
        nonlocal last_persist, latest
        latest = keep_best_locations(latest, rows)
        save_snapshot(latest)
        found = sum(1 for r in latest if r.get("found"))
        stamp = datetime.now().astimezone().strftime("%H:%M:%S")
        # Edad media de los que tienen ubicacion (para ver frescura vs iPhone)
        ages = []
        now = datetime.now().astimezone()
        for r in latest:
            if not r.get("found"):
                continue
            ages.append(max(0.0, (now - _parse_ts(r)).total_seconds()))
        age_txt = ""
        if ages:
            age_txt = f" | edad media {sum(ages) / len(ages) / 60:.0f} min"
        print(
            f"[{stamp}] {tag}: {found}/{len(latest)} en {elapsed:.1f}s{age_txt}",
            flush=True,
        )
        now_m = time.monotonic()
        if now_m - last_persist >= PERSIST_EVERY_S:
            try:
                persist_state(acc, store_path, pairs)
                last_persist = now_m
            except Exception as exc:  # noqa: BLE001
                print(f"  Aviso al guardar estado: {exc}", file=sys.stderr, flush=True)

    try:
        while True:
            cycle += 1
            started = time.monotonic()
            # Primer ciclo mas profundo; luego ventana corta para caber en ~30s.
            lb = LOOKBACK_HOURS_DEEP if cycle == 1 else LOOKBACK_HOURS
            deep = LOOKBACK_HOURS_DEEP if cycle == 1 else LOOKBACK_HOURS
            try:
                rows = fetch_offline(
                    acc,
                    pairs,
                    quiet=True,
                    lookback_hours=lb,
                    deep_hours=deep,
                )
                # Cada N ciclos, reintento profundo de los que nunca tuvieron hit.
                if cycle > 1 and cycle % 6 == 0:
                    known_ok = {
                        _device_key(r) for r in keep_best_locations(latest, rows) if r.get("found")
                    }
                    missing_pairs = [
                        (a, p)
                        for a, p in pairs
                        if _device_key(
                            {
                                "name": get_airtag_name(a, p),
                                "id": str(a.identifier)
                                if isinstance(a, FindMyAccessory) and a.identifier
                                else "",
                            }
                        )
                        not in known_ok
                    ]
                    if missing_pairs:
                        extra = fetch_offline(
                            acc,
                            missing_pairs,
                            quiet=True,
                            lookback_hours=LOOKBACK_HOURS_DEEP,
                            deep_hours=LOOKBACK_HOURS_DEEP,
                        )
                        rows = keep_best_locations(rows, extra)
            except Exception as exc:  # noqa: BLE001
                print(f"  Error red Find My: {exc}", file=sys.stderr, flush=True)
                rows = []

            elapsed = time.monotonic() - started
            publish("red", rows, elapsed)
            time.sleep(max(0.0, interval_s - elapsed))
    except KeyboardInterrupt:
        print("\nDetenido.")
    finally:
        try:
            persist_state(acc, store_path, pairs)
        except Exception:  # noqa: BLE001
            pass
        server.shutdown()
    return 0


def default_paths() -> list[Path]:
    """Prefiere el master acumulado; si no, JSON individuales (sin duplicar master)."""
    if DEFAULT_MASTER.is_file() and DEFAULT_MASTER.stat().st_size > 0:
        return [DEFAULT_MASTER]
    acc_dir = Path("accesorios")
    if not acc_dir.is_dir():
        return []
    return sorted(
        p
        for p in acc_dir.glob("*.json")
        if p.name != DEFAULT_MASTER.name and p.stat().st_size > 0
    )


def main(
    airtag_paths: list[Path],
    store_path: str,
    open_map: bool = True,
    once: bool = False,
    interval_s: float = DEFAULT_INTERVAL_S,
    port: int = DEFAULT_PORT,
) -> int:
    if not airtag_paths:
        print("No hay archivos JSON de accesorios.", file=sys.stderr)
        print("Coloca los .json en la carpeta 'accesorios/' o pasa rutas como argumentos.", file=sys.stderr)
        return 1

    pairs = load_accessories_from_paths(airtag_paths)
    if once:
        return run_once(pairs, store_path, open_map)
    return run_watch(pairs, store_path, interval_s, port, open_map)


if __name__ == "__main__":
    _load_dotenv()
    parser = argparse.ArgumentParser(
        description="Obtiene ubicaciones de AirTags via red Find My y sirve un mapa en vivo.",
    )
    parser.add_argument(
        "airtag_paths",
        type=Path,
        nargs="*",
        help="Archivos JSON de accesorios (default: accesorios/accesorios.json)",
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
        "--once",
        action="store_true",
        help="Consulta unica y sale (sin servidor HTTP en vivo)",
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Alias explicito del modo en vivo (ya es el default)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL_S,
        help=f"Segundos entre ciclos de consulta (default: {DEFAULT_INTERVAL_S})",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"Puerto HTTP del mapa en vivo (default: {DEFAULT_PORT})",
    )
    args = parser.parse_args()

    paths = list(args.airtag_paths) if args.airtag_paths else default_paths()

    sys.exit(
        main(
            paths,
            args.store_path,
            open_map=not args.no_open,
            once=args.once,
            interval_s=args.interval,
            port=args.port,
        )
    )
