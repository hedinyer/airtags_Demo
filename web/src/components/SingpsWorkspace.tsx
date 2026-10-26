"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LocateFixedIcon,
  MapPinIcon,
  RadioIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { MapaCercanas } from "@/components/MapaCercanas";
import { MapaRutaMoto } from "@/components/MapaRutaMoto";
import { MotoCercanaCard } from "@/components/MotoCercanaCard";
import { BleRadarHud } from "@/components/BleRadarHud";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { MotoCercanaApi } from "@/lib/cercanasTypes";
import { distanciaKm, type OrigenGps } from "@/lib/distancia";
import { formatearCoordenadas, parsearCoordenadas } from "@/lib/coordenadas";
import {
  mensajeErrorGps,
  vigilarGps,
  type MotivoGpsError,
} from "@/lib/geolocation";
import { normalizarPlaca } from "@/lib/placasExcluidasReportes";
import {
  CUENTAS_SINGPS,
  TOTAL_PLACAS_SINGPS,
  cuentaDePlaca,
  placaDestacadaSingps,
  type CuentaSingpsId,
} from "@/lib/singpsPlacas";
import { cn } from "@/lib/utils";

type FuenteOrigen = "gps" | "manual";

type GpsEstado =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; motivo: MotivoGpsError }
  | { kind: "ok"; origen: OrigenGps; fuente: FuenteOrigen };

type ApiEstado =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ok"; motos: MotoCercanaApi[]; generado_en: string };

type FiltroCuenta = "todas" | CuentaSingpsId;

type PlacaSingps = {
  placa: string;
  cuentaId: CuentaSingpsId;
  etiqueta: string;
  color: string;
  destacada: boolean;
  distancia_km: number | null;
  lat: number | null;
  lng: number | null;
  nombre: string;
  telefono: string;
  deuda_total: number;
  fecha_inicio: string;
  cuotas_pagadas: number;
  cuotas_pendientes: number;
  visto_en: string | null;
};

function tieneUbicacion(
  m: PlacaSingps,
): m is PlacaSingps & { lat: number; lng: number } {
  return m.lat != null && m.lng != null;
}

function vaciaDesdeCatalogo(placa: string): PlacaSingps | null {
  const cuenta = cuentaDePlaca(placa);
  if (!cuenta) return null;
  return {
    placa: normalizarPlaca(placa),
    cuentaId: cuenta.id,
    etiqueta: cuenta.etiqueta,
    color: cuenta.color,
    destacada: placaDestacadaSingps(placa),
    distancia_km: null,
    lat: null,
    lng: null,
    nombre: "",
    telefono: "",
    deuda_total: 0,
    fecha_inicio: "",
    cuotas_pagadas: 0,
    cuotas_pendientes: 0,
    visto_en: null,
  };
}

export function SingpsWorkspace() {
  const [gps, setGps] = useState<GpsEstado>({ kind: "idle" });
  const [api, setApi] = useState<ApiEstado>({ kind: "idle" });
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [rutaMoto, setRutaMoto] = useState<PlacaSingps | null>(null);
  const [radarMoto, setRadarMoto] = useState<PlacaSingps | null>(null);
  const [busquedaPlaca, setBusquedaPlaca] = useState("");
  const [filtro, setFiltro] = useState<FiltroCuenta>("todas");
  const [coordsInput, setCoordsInput] = useState("");
  const [errorCoords, setErrorCoords] = useState<string | null>(null);
  const stopWatchRef = useRef<(() => void) | null>(null);
  const fuenteRef = useRef<FuenteOrigen | null>(null);
  const gpsOkRef = useRef(false);

  const detenerWatch = useCallback(() => {
    stopWatchRef.current?.();
    stopWatchRef.current = null;
  }, []);

  const cargarCartera = useCallback(async (refresh = false) => {
    if (refresh) setRefrescando(true);
    else setApi({ kind: "loading" });
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
  }, []);

  const fijarOrigen = useCallback(
    (origen: OrigenGps, fuente: FuenteOrigen) => {
      fuenteRef.current = fuente;
      setErrorCoords(null);
      if (fuente === "manual" || !gpsOkRef.current) {
        setCoordsInput(formatearCoordenadas(origen));
      }
      gpsOkRef.current = true;
      setGps({ kind: "ok", origen, fuente });
    },
    [],
  );

  const iniciarWatch = useCallback(() => {
    detenerWatch();
    setErrorCoords(null);
    fuenteRef.current = "gps";
    setGps((prev) => (prev.kind === "ok" ? prev : { kind: "loading" }));
    stopWatchRef.current = vigilarGps(
      (g) => {
        if (fuenteRef.current === "manual") return;
        fijarOrigen({ lat: g.lat, lng: g.lng }, "gps");
      },
      (motivo) => {
        gpsOkRef.current = false;
        setGps({ kind: "error", motivo });
      },
    );
  }, [detenerWatch, fijarOrigen]);

  const pedirGps = useCallback(() => {
    iniciarWatch();
  }, [iniciarWatch]);

  const aplicarCoords = useCallback(
    (raw?: string) => {
      const parsed = parsearCoordenadas(raw ?? coordsInput);
      if (!parsed) {
        setErrorCoords(
          "Pega latitud y longitud, por ejemplo 4.609710, -74.081750",
        );
        return false;
      }
      fuenteRef.current = "manual";
      fijarOrigen(parsed, "manual");
      return true;
    },
    [coordsInput, fijarOrigen],
  );

  useEffect(() => {
    void cargarCartera();
    return () => detenerWatch();
  }, [cargarCartera, detenerWatch]);

  useEffect(() => {
    if (!rutaMoto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRutaMoto(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rutaMoto]);

  const catalogo = useMemo(() => {
    const porPlaca = new Map<string, MotoCercanaApi>();
    if (api.kind === "ok") {
      for (const m of api.motos) {
        const key = normalizarPlaca(m.placa);
        if (cuentaDePlaca(key)) porPlaca.set(key, m);
      }
    }

    const origen = gps.kind === "ok" ? gps.origen : null;
    const lista: PlacaSingps[] = [];
    for (const cuenta of CUENTAS_SINGPS) {
      for (const raw of cuenta.placas) {
        const base = vaciaDesdeCatalogo(raw);
        if (!base) continue;
        const loc = porPlaca.get(base.placa);
        const lat = loc?.lat ?? null;
        const lng = loc?.lng ?? null;
        const distancia =
          origen && lat != null && lng != null
            ? distanciaKm(origen, { lat, lng })
            : null;
        lista.push({
          ...base,
          lat,
          lng,
          distancia_km: distancia,
          nombre: loc?.nombre ?? "",
          telefono: loc?.telefono ?? "",
          deuda_total: loc?.deuda_total ?? 0,
          fecha_inicio: loc?.fecha_inicio ?? "",
          cuotas_pagadas: loc?.cuotas_pagadas ?? 0,
          cuotas_pendientes: loc?.cuotas_pendientes ?? 0,
          visto_en: loc?.visto_en ?? null,
        });
      }
    }
    lista.sort((a, b) => {
      if (a.distancia_km == null && b.distancia_km == null) {
        return a.placa.localeCompare(b.placa);
      }
      if (a.distancia_km == null) return 1;
      if (b.distancia_km == null) return -1;
      return a.distancia_km - b.distancia_km;
    });
    return lista;
  }, [api, gps]);

  const queryPlaca = normalizarPlaca(busquedaPlaca);
  const buscando = queryPlaca.length > 0;

  const visibles = useMemo(() => {
    return catalogo.filter((m) => {
      if (filtro !== "todas" && m.cuentaId !== filtro) return false;
      if (buscando && !m.placa.includes(queryPlaca)) return false;
      return true;
    });
  }, [catalogo, filtro, buscando, queryPlaca]);

  const conGps = useMemo(() => visibles.filter(tieneUbicacion), [visibles]);
  const sinGps = useMemo(
    () => visibles.filter((m) => !tieneUbicacion(m)),
    [visibles],
  );

  useEffect(() => {
    if (visibles.length === 0) {
      setSeleccionada(null);
      return;
    }
    if (!visibles.some((m) => m.placa === seleccionada)) {
      const primera = conGps[0] ?? visibles[0];
      setSeleccionada(primera.placa);
    }
  }, [visibles, conGps, seleccionada]);

  const statusLive = useMemo(() => {
    if (gps.kind === "loading") return "Obteniendo GPS";
    if (api.kind === "loading") return "Cargando ubicaciones";
    const n = visibles.length;
    const g = conGps.length;
    const s = sinGps.length;
    if (buscando) {
      return n === 1
        ? `1 resultado para ${queryPlaca}`
        : `${n} resultados para ${queryPlaca}`;
    }
    return `${g} con GPS · ${s} sin GPS · ${n} en lista`;
  }, [
    gps.kind,
    api.kind,
    visibles.length,
    conGps.length,
    sinGps.length,
    buscando,
    queryPlaca,
  ]);

  const showResults = gps.kind === "ok" && api.kind === "ok";
  const origenLabel =
    gps.kind === "ok" && gps.fuente === "gps"
      ? "Tu ubicación"
      : "Punto de búsqueda";

  const abrirRuta = (m: PlacaSingps & { lat: number; lng: number }) => {
    setSeleccionada(m.placa);
    setRutaMoto(m);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {radarMoto ? (
        <BleRadarHud
          targetName={radarMoto.placa}
          placa={radarMoto.placa}
          onClose={() => setRadarMoto(null)}
        />
      ) : null}

      {rutaMoto &&
      gps.kind === "ok" &&
      rutaMoto.lat != null &&
      rutaMoto.lng != null ? (
        <MapaRutaMoto
          placa={rutaMoto.placa}
          lat={rutaMoto.lat}
          lng={rutaMoto.lng}
          origen={gps.origen}
          onVolver={() => setRutaMoto(null)}
        />
      ) : null}

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusLive}
      </p>

      <header className="shrink-0 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground text-balance">
              Sin GPS
            </h1>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              {TOTAL_PLACAS_SINGPS} placas. Ruta tipo Uber para salir a
              buscarlas.
            </p>
          </div>
          {gps.kind === "ok" ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="hidden size-11 min-h-[44px] min-w-[44px] shrink-0 active:scale-[0.96] sm:inline-flex"
              onClick={() => void cargarCartera(true)}
              disabled={refrescando}
              aria-label="Actualizar ubicaciones"
            >
              <RefreshCwIcon
                className={`size-4 ${refrescando ? "animate-spin" : ""}`}
                aria-hidden
              />
            </Button>
          ) : null}
        </div>

        <div
          className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Filtrar por cuenta"
        >
          <Button
            type="button"
            size="sm"
            variant={filtro === "todas" ? "default" : "secondary"}
            className="h-9 shrink-0 rounded-full px-3"
            aria-pressed={filtro === "todas"}
            onClick={() => setFiltro("todas")}
          >
            Todas
            <span className="ms-1.5 tabular-nums opacity-80">
              {TOTAL_PLACAS_SINGPS}
            </span>
          </Button>
          {CUENTAS_SINGPS.map((c) => (
            <Button
              key={c.id}
              type="button"
              size="sm"
              variant={filtro === c.id ? "default" : "secondary"}
              className="h-9 shrink-0 rounded-full px-3"
              aria-pressed={filtro === c.id}
              onClick={() => setFiltro(c.id)}
            >
              <span
                className="me-1.5 size-2 rounded-full"
                style={{ backgroundColor: c.color }}
                aria-hidden
              />
              {c.etiqueta}
              <span className="ms-1.5 tabular-nums opacity-80">
                {c.placas.length}
              </span>
            </Button>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          <div className="relative">
            <MapPinIcon
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="text"
              value={coordsInput}
              onChange={(e) => {
                setCoordsInput(e.target.value);
                if (errorCoords) setErrorCoords(null);
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (!parsearCoordenadas(text)) return;
                e.preventDefault();
                aplicarCoords(text);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                aplicarCoords();
              }}
              placeholder="4.609710, -74.081750 o enlace de Maps"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-11 min-h-[44px] pe-3 ps-9 text-base md:text-base"
              aria-label="Coordenadas del punto de búsqueda"
              aria-invalid={Boolean(errorCoords)}
            />
          </div>
          {errorCoords ? (
            <p className="text-sm text-destructive" role="alert">
              {errorCoords}
            </p>
          ) : gps.kind === "ok" ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {gps.fuente === "gps" ? "Tu GPS" : "Punto pegado"}:{" "}
              {formatearCoordenadas(gps.origen)}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              className="h-11 min-h-[44px] flex-1 active:scale-[0.96]"
              onClick={() => void pedirGps()}
              disabled={gps.kind === "loading"}
              aria-label="Usar mi ubicación GPS"
            >
              <LocateFixedIcon className="mr-1.5 size-4" aria-hidden />
              {gps.kind === "loading" ? "Obteniendo GPS…" : "Usar mi ubicación"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-11 min-h-[44px] flex-1 active:scale-[0.96]"
              onClick={() => aplicarCoords()}
              disabled={!coordsInput.trim() || gps.kind === "loading"}
              aria-label="Buscar motos cerca de las coordenadas"
            >
              <MapPinIcon className="mr-1.5 size-4" aria-hidden />
              Buscar aquí
            </Button>
          </div>
        </div>

        {showResults ? (
          <div className="relative mt-3">
            <SearchIcon
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={busquedaPlaca}
              onChange={(e) => setBusquedaPlaca(e.target.value)}
              placeholder="Buscar placa…"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-11 min-h-[44px] pe-10 ps-9 text-base tracking-[0.08em] uppercase md:text-base"
              aria-label="Buscar moneda por placa"
            />
            {busquedaPlaca ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute end-1 top-1/2 size-9 -translate-y-1/2"
                onClick={() => setBusquedaPlaca("")}
                aria-label="Limpiar búsqueda"
              >
                <XIcon className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {gps.kind === "idle" ? (
          <div className="overflow-y-auto px-4">
            <Alert>
              <AlertTitle>Elige un punto para la ruta</AlertTitle>
              <AlertDescription>
                Usa tu GPS o pega coordenadas. Luego pulsa «Ver en mapa» en una
                placa para la ruta tipo Uber.
              </AlertDescription>
            </Alert>
            <ul className="mt-3 flex flex-col gap-2">
              {CUENTAS_SINGPS.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-border/80 bg-card px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                        aria-hidden
                      />
                      {c.etiqueta}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.email}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {c.placas.length}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {gps.kind === "error" ? (
          <div className="overflow-y-auto px-4">
            <Alert variant="destructive">
              <AlertTitle>No se obtuvo la ubicación</AlertTitle>
              <AlertDescription>
                {mensajeErrorGps(gps.motivo)} También puedes pegar coordenadas
                arriba y pulsar «Buscar aquí».
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {gps.kind === "loading" ? (
          <div
            className="flex flex-col gap-3 overflow-hidden px-4"
            aria-busy="true"
          >
            <p className="text-sm text-muted-foreground">Obteniendo GPS…</p>
            <Skeleton className="h-[38dvh] w-full shrink-0 rounded-none sm:rounded-xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
        ) : null}

        {api.kind === "error" ? (
          <div className="flex flex-col gap-3 overflow-y-auto px-4">
            <Alert variant="destructive">
              <AlertTitle>No se pudieron cargar las ubicaciones</AlertTitle>
              <AlertDescription>
                Revisa la conexión e inténtalo de nuevo.
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              variant="secondary"
              className="h-11 min-h-[44px] w-full active:scale-[0.96] sm:w-fit"
              onClick={() => void cargarCartera(true)}
            >
              Reintentar
            </Button>
          </div>
        ) : null}

        {gps.kind === "ok" && api.kind === "loading" ? (
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            aria-busy="true"
          >
            <p className="shrink-0 px-4 text-sm text-muted-foreground">
              Cargando ubicaciones…
            </p>
            <Skeleton className="h-[38dvh] w-full shrink-0 rounded-none lg:mx-4 lg:h-auto lg:min-h-[240px] lg:flex-1 lg:rounded-xl" />
            <div className="px-4 pt-3">
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
          </div>
        ) : null}

        {showResults ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:px-4 lg:pb-4">
            <div className="relative w-full shrink-0 lg:h-full lg:w-[55%] lg:flex-1 lg:overflow-hidden lg:rounded-xl lg:border lg:border-border">
              <MapaCercanas
                className="h-[38dvh] rounded-none border-0 lg:h-full lg:min-h-[420px] lg:rounded-xl"
                motos={conGps.map((m) => ({
                  placa: m.placa,
                  lat: m.lat,
                  lng: m.lng,
                  deuda_total: m.deuda_total,
                  distancia_km: m.distancia_km,
                }))}
                origen={gps.origen}
                origenLabel={origenLabel}
                radioKm={5}
                mostrarRadio={false}
                seleccionada={seleccionada}
                onSeleccionar={setSeleccionada}
                ajustarAMotos
                ariaLabel="Mapa de placas Sin GPS"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute end-3 top-3 z-[500] size-11 min-h-[44px] min-w-[44px] shadow-md active:scale-[0.96] lg:hidden"
                onClick={() => void cargarCartera(true)}
                disabled={refrescando}
                aria-label="Actualizar ubicaciones"
              >
                <RefreshCwIcon
                  className={`size-4 ${refrescando ? "animate-spin" : ""}`}
                  aria-hidden
                />
              </Button>
            </div>

            <aside className="flex min-h-0 flex-1 flex-col overflow-hidden lg:w-[45%] lg:max-w-md lg:ps-4">
              <div className="shrink-0 border-b border-border/60 bg-background px-4 py-2.5">
                <p className="text-sm font-medium tabular-nums text-muted-foreground">
                  {statusLive}
                </p>
              </div>

              {visibles.length === 0 ? (
                <div className="flex flex-col gap-3 overflow-y-auto px-4 py-4">
                  <Alert>
                    <AlertTitle>
                      {buscando
                        ? `No hay placa «${queryPlaca}» en esta lista`
                        : "No hay placas en este filtro"}
                    </AlertTitle>
                    <AlertDescription>
                      {buscando
                        ? "Prueba otra placa o limpia la búsqueda."
                        : "Cambia de cuenta arriba."}
                    </AlertDescription>
                  </Alert>
                  {buscando ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 min-h-[44px] w-full active:scale-[0.96] sm:w-fit"
                      onClick={() => setBusquedaPlaca("")}
                    >
                      Ver todas
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain px-4 py-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]">
                  {conGps.length > 0 ? (
                    <section aria-labelledby="con-gps-heading">
                      <h2
                        id="con-gps-heading"
                        className="mb-2 flex items-center gap-2 text-sm font-semibold"
                      >
                        Con ubicación
                        <Badge variant="secondary">{conGps.length}</Badge>
                      </h2>
                      <ul className="flex flex-col gap-3">
                        {conGps.map((m) => (
                          <li key={m.placa}>
                            <div className="relative">
                              <Badge
                                className="absolute end-3 top-3 z-10 border-0 text-[11px] text-black"
                                style={{ backgroundColor: m.color }}
                              >
                                {m.etiqueta}
                                {m.destacada ? " · ★" : ""}
                              </Badge>
                              <MotoCercanaCard
                                moto={{
                                  placa: m.placa,
                                  nombre: m.nombre,
                                  telefono: m.telefono,
                                  deuda_total: m.deuda_total,
                                  fecha_inicio: m.fecha_inicio,
                                  cuotas_pagadas: m.cuotas_pagadas,
                                  cuotas_pendientes: m.cuotas_pendientes,
                                  lat: m.lat,
                                  lng: m.lng,
                                  distancia_km: m.distancia_km,
                                  visto_en: m.visto_en,
                                }}
                                seleccionada={seleccionada === m.placa}
                                onSeleccionar={() => setSeleccionada(m.placa)}
                                onVerEnMapa={() => abrirRuta(m)}
                                onBuscarCerca={() => {
                                  setSeleccionada(m.placa);
                                  setRadarMoto(m);
                                }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {sinGps.length > 0 ? (
                    <section aria-labelledby="sin-gps-heading">
                      <h2
                        id="sin-gps-heading"
                        className={cn(
                          "mb-2 flex items-center gap-2 text-sm font-semibold",
                          conGps.length > 0 && "mt-1",
                        )}
                      >
                        Sin GPS
                        <Badge variant="secondary">{sinGps.length}</Badge>
                      </h2>
                      <ul className="flex flex-col gap-3">
                        {sinGps.map((m) => (
                          <li key={m.placa}>
                            <Card className="gap-0 rounded-2xl border-border/80 bg-card py-0 shadow-none">
                              <CardHeader className="flex flex-row items-start justify-between gap-2 px-3.5 pb-2 pt-3.5">
                                <div className="min-w-0">
                                  <p className="text-xl font-bold tracking-[0.12em] text-foreground">
                                    {m.placa}
                                    {m.destacada ? " *" : ""}
                                  </p>
                                  <p className="mt-0.5 text-sm text-foreground/90">
                                    {m.etiqueta}
                                  </p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    Sin señal Find My
                                  </p>
                                </div>
                                <Badge
                                  className="border-0 text-[11px] text-black"
                                  style={{ backgroundColor: m.color }}
                                >
                                  {m.etiqueta}
                                </Badge>
                              </CardHeader>
                              <CardFooter className="px-3.5 pb-3.5 pt-0">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="h-11 min-h-[44px] w-full rounded-lg active:scale-[0.96]"
                                  onClick={() => {
                                    setSeleccionada(m.placa);
                                    setRadarMoto(m);
                                  }}
                                >
                                  <RadioIcon className="mr-1.5 size-4" aria-hidden />
                                  Buscar cerca (BLE)
                                </Button>
                              </CardFooter>
                            </Card>
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
