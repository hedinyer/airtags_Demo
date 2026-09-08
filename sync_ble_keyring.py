"""
Genera keyrings BLE (rápido) para matching server-side.

Uso:
  python sync_ble_keyring.py
  python sync_ble_keyring.py --hours 12 --workers 4
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

from findmy import FindMyAccessory


def normalize_name(name: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", name.strip().upper())


def load_accessory_dicts(acc_dir: Path) -> list[dict]:
    master = acc_dir / "accesorios.json"
    by_id: dict[str, dict] = {}

    def add(item: dict) -> None:
        if item.get("type") != "accessory":
            return
        ident = str(item.get("identifier") or "")
        name = str(item.get("name") or "")
        key = ident or name
        if not key:
            return
        prev = by_id.get(key)
        if prev is None:
            by_id[key] = item
            return
        # Prefer richer / newer imported
        if item.get("icloud_account") and not prev.get("icloud_account"):
            by_id[key] = item

    if master.is_file():
        data = json.loads(master.read_text(encoding="utf-8"))
        if isinstance(data, list):
            for x in data:
                if isinstance(x, dict):
                    add(x)
        elif isinstance(data, dict):
            add(data)

    for path in acc_dir.glob("*.json"):
        if path.name == "accesorios.json":
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            add(data)
        elif isinstance(data, list):
            for x in data:
                if isinstance(x, dict):
                    add(x)

    return list(by_id.values())


def build_keyring(item: dict, hours: float) -> dict | None:
    try:
        acc = FindMyAccessory.from_json(item)
    except Exception as exc:  # noqa: BLE001
        return {"_error": f"{item.get('name')}: {exc}"}

    name = acc.name or acc.identifier
    if not name:
        return None

    now = datetime.now(timezone.utc)
    # Ventana estrecha por índice (± hours/15min), no keys_between amplio
    steps = max(1, int((hours * 60) // 15) + 2)
    start = max(0, acc._alignment_index - steps)
    end = acc._alignment_index + steps

    nearby: set[str] = set()
    suffix: set[str] = set()
    for ind in range(start, end + 1):
        for key in acc.keys_at(ind):
            b = key.adv_key_bytes
            nearby.add(b[:6].hex())
            suffix.add(b[6:].hex())

    return {
        "generated_at": now.isoformat(),
        "name": str(name),
        "id": str(acc.identifier or ""),
        "nearby": sorted(nearby),
        "suffix": sorted(suffix),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync BLE keyrings for web match API")
    parser.add_argument("--acc-dir", type=Path, default=Path("accesorios"))
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("web/private/ble-keyring"),
    )
    parser.add_argument("--hours", type=float, default=12.0)
    parser.add_argument("--only", type=str, default=None)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    items = load_accessory_dicts(args.acc_dir.resolve())
    if args.only:
        want = normalize_name(args.only)
        items = [i for i in items if normalize_name(str(i.get("name") or "")) == want]

    if not items:
        print("No hay accesorios para exportar.", file=sys.stderr)
        return 1

    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / ".gitkeep").write_text("", encoding="utf-8")

    written = 0
    errors = 0

    def work(item: dict) -> tuple[str, dict | None]:
        return (str(item.get("name") or item.get("identifier") or "?"), build_keyring(item, args.hours))

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(work, item) for item in items]
        for fut in as_completed(futures):
            label, payload = fut.result()
            if payload is None:
                continue
            if "_error" in payload:
                errors += 1
                print(f"skip {payload['_error']}", file=sys.stderr)
                continue
            key = normalize_name(str(payload["name"]))
            if not key:
                continue
            path = out_dir / f"{key}.json"
            path.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
            written += 1
            if written % 25 == 0 or written == 1:
                print(f"… {written} keyrings", flush=True)

    print(f"\nOK: {written} keyrings (errores {errors}) -> {out_dir}", flush=True)
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
