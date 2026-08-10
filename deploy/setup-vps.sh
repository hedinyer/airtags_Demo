#!/usr/bin/env bash
# Ejecutar en el VPS como root: bash setup-vps.sh
set -euo pipefail

APP_DIR=/opt/airtags
APP_USER=airtags

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Corre como root (sudo bash setup-vps.sh)" >&2
  exit 1
fi

id "$APP_USER" &>/dev/null || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"

apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip

mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

sudo -u "$APP_USER" bash -lc "
  cd '$APP_DIR'
  python3 -m venv .venv
  .venv/bin/pip install -U pip
  .venv/bin/pip install -r deploy/requirements.txt
"

install -m 644 "$(dirname "$0")/airtags.service" /etc/systemd/system/airtags.service
systemctl daemon-reload
systemctl enable airtags.service

echo "Listo. Copia los archivos de la app a $APP_DIR y luego:"
echo "  systemctl start airtags"
echo "  journalctl -u airtags -f"
