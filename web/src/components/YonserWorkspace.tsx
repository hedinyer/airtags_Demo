"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCwIcon, SunIcon } from "lucide-react";

import { MapaCampo } from "@/components/MapaCampo";
import { MapaRutaMoto } from "@/components/MapaRutaMoto";
import { MotoCercanaCard } from "@/components/MotoCercanaCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DISTANCIA_CAMPO_KM } from "@/lib/campoConstants";
import { distanciaKm } from "@/lib/distancia";
import { cn } from "@/lib/utils";
import { useCampoSesion } from "@/hooks/useCampoSesion";
import type { MotoCercanaApi } from "@/lib/cercanasTypes";

type MotoConDistancia = MotoCercanaApi & { distancia_km: number };

export function YonserWorkspace() {
  const { gps, api, campo, refrescando, cargarCartera, activarGps, mensajeErrorGps } =
    useCampoSesion("yonser");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [rutaMoto, setRutaMoto] = useState<MotoConDistancia | null>(null);
  const prevAsignadasRef = useRef<string[]>([]);
  const [anuncioAsignacion, setAnuncioAsignacion] = useState("");
  const [pantallaActiva, setPantallaActiva] = useState(false);
  const [mostrarInstalar, setMostrarInstalar] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const asignadas = useMemo(
    () =>
      campo.kind === "ok"
        ? new Set(campo.estado.asignadas)
        : new Set<string>(),
    [campo],
  );

  const origen = useMemo(() => {
    if (gps.kind !== "ok") return null;
    return { lat: gps.gps.lat, lng: gps.gps.lng };
  }, [gps]);

  const motosConDistancia = useMemo(() => {
    if (!origen || api.kind !== "ok") return [] as MotoConDistancia[];
    const lista: MotoConDistancia[] = api.motos.map((m) => ({
      ...m,
      distancia_km: distanciaKm(origen, { lat: m.lat, lng: m.lng }),
    }));
    return lista
      .filter((m) => m.distancia_km <= DISTANCIA_CAMPO_KM)
      .sort((a, b) => {
        const aAsig = asignadas.has(a.placa) ? 0 : 1;
        const bAsig = asignadas.has(b.placa) ? 0 : 1;
        if (aAsig !== bAsig) return aAsig - bAsig;
        return a.distancia_km - b.distancia_km;
      });
  }, [origen, api, asignadas]);

  const asignadasLista = useMemo(
    () => motosConDistancia.filter((m) => asignadas.has(m.placa)),
    [motosConDistancia, asignadas],
  );

  const otrasLista = useMemo(
    () => motosConDistancia.filter((m) => !asignadas.has(m.placa)),
    [motosConDistancia, asignadas],
  );

  useEffect(() => {
    if (campo.kind !== "ok") return;
    const prev = new Set(prevAsignadasRef.current);
    const nuevas = campo.estado.asignadas.filter((p) => !prev.has(p));
    prevAsignadasRef.current = campo.estado.asignadas;
    if (nuevas.length > 0) {
      setAnuncioAsignacion(
        nuevas.length === 1
          ? `Nueva asignación: ${nuevas[0]}`
          : `${nuevas.length} nuevas asignaciones`,
      );
    }
  }, [campo]);

  useEffect(() => {
    if (!rutaMoto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRutaMoto(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rutaMoto]);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as Navigator & { standalone?: boolean }).standalone);
    setMostrarInstalar(!standalone);
  }, []);

  useEffect(() => {
    return () => {
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onVis = async () => {
      if (
        document.visibilityState !== "visible" ||
        !pantallaActiva ||
        wakeLockRef.current
      ) {
        return;
      }
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        setPantallaActiva(false);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pantallaActiva]);

  const togglePantallaActiva = async () => {
    if (pantallaActiva) {
      await wakeLockRef.current?.release();
      wakeLockRef.current = null;
      setPantallaActiva(false);
      return;
    }
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setPantallaActiva(true);
      wakeLockRef.current.addEventListener("release", () => {
        setPantallaActiva(false);
        wakeLockRef.current = null;
      });
    } catch {
      setPantallaActiva(false);
    }
  };

  const statusLive = useMemo(() => {
    if (gps.kind === "idle") return "Ubicación pendiente";
    if (gps.kind === "loading") return "Obteniendo GPS";
    if (api.kind === "loading") return "Cargando cartera";
    const n = motosConDistancia.length;
    const a = asignadasLista.length;
    if (a > 0) {
      return `${a} para ir ahora · ${n} placas a ${DISTANCIA_CAMPO_KM} km`;
    }
    return n === 1
      ? `1 placa a ${DISTANCIA_CAMPO_KM} km`
      : `${n} placas a ${DISTANCIA_CAMPO_KM} km`;
  }, [gps.kind, api.kind, motosConDistancia.length, asignadasLista.length]);

  const showResults = gps.kind === "ok" && api.kind === "ok" && origen;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {rutaMoto && origen ? (
        <MapaRutaMoto
          placa={rutaMoto.placa}
          lat={rutaMoto.lat}
          lng={rutaMoto.lng}
          origen={origen}
          onVolver={() => setRutaMoto(null)}
        />
      ) : null}

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {anuncioAsignacion || statusLive}
      </p>

      <header className="shrink-0 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground text-balance">
              Campo — Yonser
            </h1>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Placas a {DISTANCIA_CAMPO_KM} km. Las asignadas por Nicolas van
              primero.
            </p>
          </div>
          {gps.kind === "ok" ? (
            <div className="flex shrink-0 gap-2">
              {"wakeLock" in navigator ? (
                <Button
                  type="button"
                  variant={pantallaActiva ? "default" : "outline"}
                  size="icon"
                  className="size-11 min-h-[44px] min-w-[44px]"
                  onClick={() => void togglePantallaActiva()}
                  aria-pressed={pantallaActiva}
                  aria-label={
                    pantallaActiva
                      ? "Desactivar pantalla siempre activa"
                      : "Mantener pantalla activa"
                  }
                >
                  <SunIcon className="size-4" aria-hidden />
                </Button>
              ) : null}
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
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {mostrarInstalar && gps.kind !== "idle" ? (
          <div className="shrink-0 px-4 pb-2">
            <Alert>
              <AlertTitle>Mejor seguimiento en Android</AlertTitle>
              <AlertDescription>
                Instala la app desde el menú de Chrome («Añadir a pantalla de
                inicio») para que el GPS y el permiso se mantengan más estables.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {gps.kind === "idle" ? (
          <div className="flex flex-col gap-3 px-4">
            <Alert>
              <AlertTitle>Ubicación requerida</AlertTitle>
              <AlertDescription>
                Activa el GPS una sola vez. El navegador lo recordará en visitas
                futuras.
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
              onClick={() => void cargarCartera(true)}
            >
              Reintentar
            </Button>
          </div>
        ) : null}

        {showResults && origen ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:px-4 lg:pb-4">
            <div className="relative w-full shrink-0 lg:h-full lg:w-[55%] lg:flex-1">
              <MapaCampo
                className="h-[38dvh] rounded-none border-0 lg:h-full lg:min-h-[420px] lg:rounded-xl lg:border"
                motos={motosConDistancia.map((m) => ({
                  placa: m.placa,
                  lat: m.lat,
                  lng: m.lng,
                  deuda_total: m.deuda_total,
                  distancia_km: m.distancia_km,
                  asignada: asignadas.has(m.placa),
                }))}
                centro={origen}
                operadores={[
                  {
                    lat: origen.lat,
                    lng: origen.lng,
                    label: "Yonser",
                    color: "#f97316",
                  },
                ]}
                seleccionada={seleccionada}
                onSeleccionar={setSeleccionada}
                ariaLabel="Mapa de placas cercanas a Yonser"
              />
            </div>

            <aside className="flex min-h-0 flex-1 flex-col overflow-hidden lg:w-[45%] lg:max-w-md lg:ps-4">
              <div className="shrink-0 border-b border-border/60 px-4 py-2.5">
                <p className="text-sm font-medium tabular-nums text-muted-foreground">
                  {statusLive}
                </p>
              </div>

              {motosConDistancia.length === 0 ? (
                <div className="px-4 py-4">
                  <Alert>
                    <AlertTitle>Sin placas en el radio</AlertTitle>
                    <AlertDescription>
                      No hay motos con deuda a {DISTANCIA_CAMPO_KM} km de ti.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
                  {asignadasLista.length > 0 ? (
                    <section aria-labelledby="ir-ahora-heading">
                      <h2
                        id="ir-ahora-heading"
                        className="mb-2 flex items-center gap-2 text-sm font-semibold"
                      >
                        Ir ahora
                        <Badge variant="secondary">{asignadasLista.length}</Badge>
                      </h2>
                      <ul className="flex flex-col gap-3">
                        {asignadasLista.map((m) => (
                          <li key={m.placa}>
                            <div className="relative">
                              <Badge
                                className="absolute end-3 top-3 z-10 bg-orange-500 text-white"
                                aria-hidden
                              >
                                Asignada
                              </Badge>
                              <MotoCercanaCard
                                moto={m}
                                seleccionada={seleccionada === m.placa}
                                onSeleccionar={() => setSeleccionada(m.placa)}
                                onVerEnMapa={() => {
                                  setSeleccionada(m.placa);
                                  setRutaMoto(m);
                                }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {otrasLista.length > 0 ? (
                    <section aria-labelledby="cercanas-heading">
                      <h2
                        id="cercanas-heading"
                        className={cn(
                          "mb-2 text-sm font-semibold",
                          asignadasLista.length > 0 && "mt-2",
                        )}
                      >
                        Cercanas
                      </h2>
                      <ul className="flex flex-col gap-3">
                        {otrasLista.map((m) => (
                          <li key={m.placa}>
                            <MotoCercanaCard
                              moto={m}
                              seleccionada={seleccionada === m.placa}
                              onSeleccionar={() => setSeleccionada(m.placa)}
                              onVerEnMapa={() => {
                                setSeleccionada(m.placa);
                                setRutaMoto(m);
                              }}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              )}
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
