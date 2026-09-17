/** Marcador mapa: emoji moto + placa en rectángulo amarillo banana. */
export function htmlMarcadorMoto(placa: string, activa = false): string {
  const ring = activa ? "2px solid #38bdf8" : "1px solid rgba(0,0,0,0.15)";
  const shadow = activa
    ? "0 2px 8px rgba(0,0,0,.4)"
    : "0 1px 4px rgba(0,0,0,.35)";
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-100%);">
  <span style="font-size:28px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));" aria-hidden="true">🏍️</span>
  <span style="background:#FFE135;color:#111;font:700 11px/1.15 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.06em;padding:3px 7px;border-radius:4px;border:${ring};box-shadow:${shadow};white-space:nowrap;">${placa}</span>
</div>`;
}

export const ICON_ANCHOR_MOTO: [number, number] = [0, 0];
export const ICON_SIZE_MOTO: [number, number] = [1, 1];
