"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, RefreshCwIcon, XIcon } from "lucide-react";

import { MapaCampo } from "@/components/MapaCampo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DISTANCIA_CAMPO_KM } from "@/lib/campoConstants";
import { distanciaKm, formatearDistancia } from "@/lib/distancia";
import { formatearCOP } from "@/lib/formatoDinero";
import { haceCuanto } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import { useCampoSesion } from "@/hooks/useCampoSesion";
import type { MotoCercanaApi } from "@/lib/cercanasTypes";

type MotoConDistancia = MotoCercanaApi & { distancia_km: number };

export function NicolasWorkspace() {
  const {
    gps,
    api,
    campo,
    refrescando,
    cargarCartera,
    toggleAsignacion,
    activarGps,
    mensajeErrorGps,
  } = useCampoSesion("nicolas");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  const asignadas = useMemo(
    () =>
      campo.kind === "ok"
        ? new Set(campo.estado.asignadas)
        : new Set<string>(),
    [campo],
  );

  const origenFiltro = useMemo(() => {
    if (campo.kind !== "ok") return null;
    const y = campo.estado.operadores.yonser;
    if (!y?.vivo) return null;
    return { lat: y.lat, lng: y.lng };
  }, [campo]);

  const yonser =
    campo.kind === "ok" ? campo.estado.operadores.yonser : undefined;
  const yonserVivo = yonser?.vivo ?? false;

  const motosCercanas = useMemo(() => {
    if (!origenFiltro || api.kind !== "ok") return [] as MotoConDistancia[];
    const lista: MotoConDistancia[] = api.motos.map((m) => ({
      ...m,
      distancia_km: distanciaKm(origenFiltro, { lat: m.lat, lng: m.lng }),
    }));
    return lista
      .filter((m) => m.distancia_km <= DISTANCIA_CAMPO_KM)
      .sort((a, b) => a.distancia_km - b.distancia_km);
  }, [origenFiltro, api]);

  const operadoresMapa = useMemo(() => {
    const ops: { lat: number; lng: number; label: string; color: string }[] =
      [];
    if (gps.kind === "ok") {
      ops.push({
        lat: gps.gps.lat,
        lng: gps.gps.lng,
        label: "Nicolas",
        color: "#38bdf8",
      });
    }
    if (yonserVivo && yonser) {
      ops.push({
        lat: yonser.lat,
        lng: yonser.lng,
        label: "Yonser",
        color: "#f97316",
      });
    }
    return ops;
  }, [gps, yonser, yonserVivo]);

  const statusLive = useMemo(() => {
    if (gps.kind === "idle") return "Ubicación pendiente";
    if (gps.kind === "loading") return "Obteniendo GPS";
    if (api.kind === "loading") return "Cargando cartera";
    if (!yonserVivo) return "Esperando ubicación de Yonser";
    if (motosCercanas.length === 0) {
      return `0 monedas a ${DISTANCIA_CAMPO_KM} km de Yonser`;
    }
    return `${motosCercanas.length} monedas a ${DISTANCIA_CAMPO_KM} km de Yonser · ${asignadas.size} asignadas`;
  }, [gps.kind, api.kind, yonserVivo, motosCercanas.length, asignadas.size]);

  useEffect(() => {
    if (motosCercanas.length === 0) {
      setSeleccionada(null);
      return;
    }
    if (!seleccionada || !motosCercanas.some((m) => m.placa === seleccionada)) {
      setSeleccionada(motosCercanas[0].placa);
    }
  }, [motosCercanas, seleccionada]);

  const showResults =
    gps.kind === "ok" && api.kind === "ok" && yonserVivo && origenFiltro;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusLive}
      </p>

      <header className="shrink-0 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground text-balance">
              Campo — Nicolas
            </h1>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Monedas a {DISTANCIA_CAMPO_KM} km de Yonser. Asigna destinos.
            </p>
          </div>
          {gps.kind === "ok" ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 min-h-[44px] min-w-[44px] shrink-0"
              onClick={() => void cargarCartera(true)}
              disabled={refrescando}
              aria-label="Actualizar cartera y ubicaciones"
            >
              <RefreshCwIcon
                className={`size-4 ${refrescando ? "animate-spin" : ""}`}
                aria-hidden
              />
            </Button>
          ) : null}
        </div>

        {campo.kind === "ok" && yonser ? (
          <p className="mt-2 text-xs tabular-nums text-muted-foreground">
            Yonser:{" "}
            {yonserVivo
              ? `activo · ${haceCuanto(yonser.updated_at)}`
              : "sin señal (más de 60 s)"}
          </p>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {gps.kind === "idle" ? (
          <div className="flex flex-col gap-3 px-4">
            <Alert>
              <AlertTitle>Ubicación requerida</AlertTitle>
              <AlertDescription>
                Activa el GPS una sola vez para compartir tu posición con Yonser.
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              className="h-11 min-h-[44px] w-full sm:w-fit"
              onClick={activarGps}
            >
              Activar ubicación
            </Button>
          </div>
        ) : null}

        {gps.kind === "loading" || api.kind === "loading" ? (
          <div className="flex flex-col gap-3 px-4" aria-busy="true">
            <Skeleton className="h-[38dvh] w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
        ) : null}

        {gps.kind === "error" ? (
          <div className="flex flex-col gap-3 px-4">
            <Alert variant="destructive">
              <AlertTitle>GPS requerido</AlertTitle>
              <AlertDescription>{mensajeErrorGps(gps.motivo)}</AlertDescription>
            </Alert>
            {gps.motivo === "denegado" ? (
              <Button
                type="button"
                variant="secondary"
                className="h-11 min-h-[44px] w-full sm:w-fit"
                onClick={activarGps}
              >
                Reintentar
              </Button>
            ) : null}
          </div>
        ) : null}

        {api.kind === "error" ? (
          <div className="flex flex-col gap-3 px-4">
            <Alert variant="destructive">
              <AlertTitle>No se pudo cargar la cartera</AlertTitle>
              <AlertDescription>Revisa la conexión e inténtalo de nuevo.</AlertDescription>
            </Alert>
            <Button
              type="button"
              variant="secondary"
              className="h-11 min-h-[44px] w-full sm:w-fit"
              onClick={() => void cargarCartera(true)}
            >
              Reintentar
            </Button>
          </div>
        ) : null}

        {gps.kind === "ok" && api.kind === "ok" && !yonserVivo ? (
          <div className="px-4">
            <Alert>
              <AlertTitle>Esperando ubicación de Yonser</AlertTitle>
              <AlertDescription>
                Yonser debe abrir /yonser y permitir GPS. Las monedas se
                filtrarán a {DISTANCIA_CAMPO_KM} km de su posición.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {showResults && origenFiltro ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:px-4 lg:pb-4">
            <div className="relative w-full shrink-0 lg:h-full lg:w-[55%] lg:flex-1">
              <MapaCampo
                className="h-[38dvh] rounded-none border-0 lg:h-full lg:min-h-[420px] lg:rounded-xl lg:border"
                motos={motosCercanas.map((m) => ({
                  placa: m.placa,
                  lat: m.lat,
                  lng: m.lng,
                  deuda_total: m.deuda_total,
                  distancia_km: m.distancia_km,
                  asignada: asignadas.has(m.placa),
                }))}
                centro={origenFiltro}
                operadores={operadoresMapa}
                seleccionada={seleccionada}
                onSeleccionar={setSeleccionada}
                ariaLabel="Mapa de monedas cerca de Yonser con ubicaciones de Nicolas y Yonser"
              />
            </div>

            <aside className="flex min-h-0 flex-1 flex-col overflow-hidden lg:w-[45%] lg:max-w-md lg:ps-4">
              <div className="shrink-0 border-b border-border/60 px-4 py-2.5">
                <p className="text-sm font-medium tabular-nums text-muted-foreground">
                  {statusLive}
                </p>
              </div>

              {motosCercanas.length === 0 ? (
                <div className="px-4 py-4">
                  <Alert>
                    <AlertTitle>Sin monedas en el radio</AlertTitle>
                    <AlertDescription>
                      No hay motos con deuda a {DISTANCIA_CAMPO_KM} km de Yonser.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
                  {motosCercanas.map((m) => {
                    const asignada = asignadas.has(m.placa);
                    return (
                      <li key={m.placa}>
                        <Card
                          className={cn(
                            "gap-0 rounded-2xl border-border/80 py-0 shadow-none",
                            seleccionada === m.placa &&
                              "border-primary ring-2 ring-primary/30",
                            asignada && "border-orange-500/60",
                          )}
                        >
                          <CardHeader className="px-3.5 pb-2 pt-3.5">
                            <button
                              type="button"
                              className="w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => setSeleccionada(m.placa)}
                              aria-pressed={seleccionada === m.placa}
                            >
                              <p className="text-xl font-bold tracking-[0.12em]">
                                {m.placa}
                              </p>
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {formatearDistancia(m.distancia_km)} de Yonser
                              </p>
                              <p className="mt-1 text-sm font-medium text-destructive tabular-nums">
                                {formatearCOP(m.deuda_total)}
                              </p>
                            </button>
                          </CardHeader>
                          <CardFooter className="px-3.5 pb-3.5 pt-0">
                            <Button
                              type="button"
                              variant={asignada ? "secondary" : "default"}
                              className="h-11 min-h-[44px] w-full"
                              aria-pressed={asignada}
                              aria-label={
                                asignada
                                  ? `Quitar asignación de ${m.placa} a Yonser`
                                  : `Asignar placa ${m.placa} a Yonser`
                              }
                              onClick={() =>
                                void toggleAsignacion(m.placa, !asignada)
                              }
                            >
                              {asignada ? (
                                <>
                                  <XIcon className="mr-1.5 size-4" aria-hidden />
                                  Quitar asignación
                                </>
                              ) : (
                                <>
                                  <CheckIcon className="mr-1.5 size-4" aria-hidden />
                                  Asignar a Yonser
                                </>
                              )}
                            </Button>
                          </CardFooter>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
