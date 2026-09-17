/** Marcador asignada: borde naranja en lugar de azul. */
export function htmlMarcadorMotoAsignada(placa: string, activa = false): string {
  const ring = activa ? "2px solid #38bdf8" : "2px solid #f97316";
  const shadow = activa
    ? "0 2px 8px rgba(0,0,0,.4)"
    : "0 1px 4px rgba(0,0,0,.35)";
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-100%);">
  <span style="font-size:28px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));" aria-hidden="true">🏍️</span>
  <span style="background:#FFE135;color:#111;font:700 11px/1.15 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.06em;padding:3px 7px;border-radius:4px;border:${ring};box-shadow:${shadow};white-space:nowrap;">${placa} ★</span>
</div>`;
}

export function htmlMarcadorOperador(
  nombre: string,
  color: string,
): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
  <span style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></span>
  <span style="margin-top:2px;background:rgba(0,0,0,.75);color:#fff;font:600 10px/1.2 system-ui,sans-serif;padding:2px 6px;border-radius:4px;white-space:nowrap;">${nombre}</span>
</div>`;
}
