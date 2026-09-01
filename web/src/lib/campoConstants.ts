export const DISTANCIA_CAMPO_KM = 3;

/** Operador sin señal si no actualiza en este tiempo. */
export const CAMPO_STALE_MS = 60_000;

export const CAMPO_POLL_MS = 3_000;
export const CAMPO_POSICION_THROTTLE_MS = 2_000;

export type RolCampo = "nicolas" | "yonser";

export const ROLES_CAMPO: RolCampo[] = ["nicolas", "yonser"];

export function esRolCampo(v: unknown): v is RolCampo {
  return v === "nicolas" || v === "yonser";
}
