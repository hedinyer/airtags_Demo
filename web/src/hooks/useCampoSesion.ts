"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  CAMPO_GPS_MIN_MOVIMIENTO_KM,
  CAMPO_POLL_MS,
  CAMPO_POSICION_THROTTLE_MS,
  type RolCampo,
} from "@/lib/campoConstants";
import { tieneDeudaCartera, type MotoCercanaApi } from "@/lib/cercanasTypes";
import { distanciaKm } from "@/lib/distancia";
import {
  consultarPermisoGps,
  mensajeErrorGps,
  publicarPosicionBeacon,
  vigilarGps,
  type GpsPreciso,
  type MotivoGpsError,
} from "@/lib/geolocation";

export type OperadorRemoto = {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  updated_at: string;
  vivo: boolean;
};

export type EstadoCampo = {
  operadores: Partial<Record<RolCampo, OperadorRemoto>>;
  asignadas: string[];
  generado_en: string;
};

type GpsEstado =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; motivo: MotivoGpsError }
  | { kind: "ok"; gps: GpsPreciso };

type ApiEstado =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ok"; motos: MotoCercanaApi[]; generado_en: string };

type CampoEstado =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ok"; estado: EstadoCampo };

async function publicarPosicion(
  rol: RolCampo,
  gps: GpsPreciso,
): Promise<void> {
  await fetch("/api/campo/posicion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rol,
      lat: gps.lat,
      lng: gps.lng,
      accuracy_m: gps.accuracy_m,
    }),
    cache: "no-store",
  });
}

export function useCampoSesion(rol: RolCampo) {
  const [gps, setGps] = useState<GpsEstado>({ kind: "idle" });
  const [api, setApi] = useState<ApiEstado>({ kind: "idle" });
  const [campo, setCampo] = useState<CampoEstado>({ kind: "idle" });
  const [refrescando, setRefrescando] = useState(false);
  const ultimoPostRef = useRef(0);
  const ultimoPublicadoRef = useRef<GpsPreciso | null>(null);
  const gpsRef = useRef<GpsPreciso | null>(null);
  const stopWatchRef = useRef<(() => void) | null>(null);
  const gpsActivoRef = useRef(false);

  const publicarSiNecesario = useCallback(
    (g: GpsPreciso, forzar = false) => {
      const prev = ultimoPublicadoRef.current;
      if (
        !forzar &&
        prev &&
        distanciaKm(prev, g) < CAMPO_GPS_MIN_MOVIMIENTO_KM
      ) {
        return;
      }

      const now = Date.now();
      if (!forzar && now - ultimoPostRef.current < CAMPO_POSICION_THROTTLE_MS) {
        return;
      }

      ultimoPostRef.current = now;
      ultimoPublicadoRef.current = g;
      void publicarPosicion(rol, g);
    },
    [rol],
  );

  const onGpsUpdate = useCallback(
    (g: GpsPreciso) => {
      const prev = gpsRef.current;
      gpsRef.current = g;

      const movimientoSignificativo =
        !prev || distanciaKm(prev, g) >= CAMPO_GPS_MIN_MOVIMIENTO_KM;

      if (movimientoSignificativo || !gpsActivoRef.current) {
        gpsActivoRef.current = true;
        setGps({ kind: "ok", gps: g });
      }

      publicarSiNecesario(g);
    },
    [publicarSiNecesario],
  );

  const onGpsError = useCallback((motivo: MotivoGpsError) => {
    gpsActivoRef.current = false;
    setGps({ kind: "error", motivo });
  }, []);

  const detenerWatch = useCallback(() => {
    stopWatchRef.current?.();
    stopWatchRef.current = null;
  }, []);

  const iniciarWatch = useCallback(() => {
    detenerWatch();
    setGps({ kind: "loading" });
    gpsActivoRef.current = false;
    stopWatchRef.current = vigilarGps(onGpsUpdate, onGpsError);
  }, [detenerWatch, onGpsUpdate, onGpsError]);

  const activarGps = useCallback(() => {
    iniciarWatch();
  }, [iniciarWatch]);

  const cargarCartera = useCallback(async (refresh = false) => {
    if (refresh) setRefrescando(true);
    else if (api.kind !== "ok") setApi({ kind: "loading" });
    try {
      const res = await fetch(
        `/api/cercanas${refresh ? "?refresh=1" : ""}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("api");
      const data = (await res.json()) as {
        motos: MotoCercanaApi[];
        generado_en: string;
      };
      setApi({
        kind: "ok",
        motos: (data.motos ?? []).filter(tieneDeudaCartera),
        generado_en: data.generado_en,
      });
    } catch {
      setApi({ kind: "error" });
    } finally {
      setRefrescando(false);
    }
  }, [api.kind]);

  const cargarEstado = useCallback(async () => {
    try {
      const res = await fetch("/api/campo/estado", { cache: "no-store" });
      if (!res.ok) throw new Error("estado");
      const data = (await res.json()) as EstadoCampo;
      setCampo({ kind: "ok", estado: data });
    } catch {
      setCampo((prev) => (prev.kind === "ok" ? prev : { kind: "error" }));
    }
  }, []);

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      const permiso = await consultarPermisoGps();
      if (cancelado) return;

      if (permiso === "denied") {
        setGps({ kind: "error", motivo: "denegado" });
        return;
      }

      if (permiso === "granted") {
        iniciarWatch();
        return;
      }

      setGps({ kind: "idle" });
    })();

    return () => {
      cancelado = true;
      detenerWatch();
    };
  }, [iniciarWatch, detenerWatch]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (gpsRef.current) {
          publicarSiNecesario(gpsRef.current, true);
        }
        if (gpsActivoRef.current || gpsRef.current) {
          detenerWatch();
          stopWatchRef.current = vigilarGps(onGpsUpdate, onGpsError);
        }
        return;
      }

      if (gpsRef.current) {
        publicarPosicionBeacon(rol, gpsRef.current);
      }
    };

    const onPageHide = () => {
      if (gpsRef.current) {
        publicarPosicionBeacon(rol, gpsRef.current);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [rol, onGpsUpdate, onGpsError, publicarSiNecesario, detenerWatch]);

  useEffect(() => {
    if (gps.kind === "ok" && api.kind === "idle") {
      void cargarCartera();
    }
  }, [gps.kind, api.kind, cargarCartera]);

  useEffect(() => {
    setCampo({ kind: "loading" });
    void cargarEstado();
    const id = setInterval(() => void cargarEstado(), CAMPO_POLL_MS);
    return () => clearInterval(id);
  }, [cargarEstado]);

  const toggleAsignacion = useCallback(async (placa: string, activa: boolean) => {
    const res = await fetch("/api/campo/asignar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placa, activa }),
      cache: "no-store",
    });
    if (res.ok) void cargarEstado();
    return res.ok;
  }, [cargarEstado]);

  return {
    gps,
    api,
    campo,
    refrescando,
    cargarCartera,
    toggleAsignacion,
    activarGps,
    mensajeErrorGps,
  };
}
