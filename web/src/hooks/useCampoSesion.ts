"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  CAMPO_POLL_MS,
  CAMPO_POSICION_THROTTLE_MS,
  type RolCampo,
} from "@/lib/campoConstants";
import type { MotoCercanaApi } from "@/lib/cercanasTypes";
import {
  mensajeErrorGps,
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
  const gpsRef = useRef<GpsPreciso | null>(null);

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
        motos: data.motos ?? [],
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
    setGps({ kind: "loading" });

    const stop = vigilarGps(
      (g) => {
        gpsRef.current = g;
        setGps({ kind: "ok", gps: g });

        const now = Date.now();
        if (now - ultimoPostRef.current >= CAMPO_POSICION_THROTTLE_MS) {
          ultimoPostRef.current = now;
          void publicarPosicion(rol, g);
        }
      },
      (motivo) => setGps({ kind: "error", motivo }),
    );

    return stop;
  }, [rol]);

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
    mensajeErrorGps,
  };
}
