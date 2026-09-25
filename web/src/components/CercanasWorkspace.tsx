"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LocateFixedIcon,
  MapPinIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { MapaCercanas } from "@/components/MapaCercanas";
import { MapaRutaMoto } from "@/components/MapaRutaMoto";
import { MotoCercanaCard } from "@/components/MotoCercanaCard";
import { BleRadarHud } from "@/components/BleRadarHud";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { tieneDeudaCartera, type MotoCercanaApi } from "@/lib/cercanasTypes";
import {
  DISTANCIA_MAX_CERCANAS_KM,
  distanciaKm,
  type OrigenGps,
} from "@/lib/distancia";
import {
  formatearCoordenadas,
  parsearCoordenadas,
} from "@/lib/coordenadas";
import {
  mensajeErrorGps,
  obtenerGpsPreciso,
  type MotivoGpsError,
} from "@/lib/geolocation";
import { normalizarPlaca } from "@/lib/placasExcluidasReportes";

type MotoConDistancia = MotoCercanaApi & { distancia_km: number };

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

export function CercanasWorkspace() {
  const [gps, setGps] = useState<GpsEstado>({ kind: "idle" });
  const [api, setApi] = useState<ApiEstado>({ kind: "idle" });
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [rutaMoto, setRutaMoto] = useState<MotoConDistancia | null>(null);
  const [busquedaPlaca, setBusquedaPlaca] = useState("");
  const [radarMoto, setRadarMoto] = useState<MotoConDistancia | null>(null);
  const [coordsInput, setCoordsInput] = useState("");
  const [errorCoords, setErrorCoords] = useState<string | null>(null);

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
      setErrorCoords(null);
      setCoordsInput(formatearCoordenadas(origen));
      setGps({ kind: "ok", origen, fuente });
      if (api.kind !== "ok" && api.kind !== "loading") {
        void cargarCartera();
      }
    },
    [api.kind, cargarCartera],
  );

  const aplicarCoords = useCallback(
    (raw?: string) => {
      const parsed = parsearCoordenadas(raw ?? coordsInput);
      if (!parsed) {
        setErrorCoords(
          "Pega latitud y longitud, por ejemplo 4.609710, -74.081750",
        );
        return false;
      }
      fijarOrigen(parsed, "manual");
      return true;
    },
    [coordsInput, fijarOrigen],
  );

  const pedirGps = useCallback(async () => {
    setErrorCoords(null);
    setGps({ kind: "loading" });
    const res = await obtenerGpsPreciso({ samples: 3, maxWaitMs: 25_000 });
    if (!res.ok) {
      setGps({ kind: "error", motivo: res.motivo });
      return;
    }
    fijarOrigen({ lat: res.gps.lat, lng: res.gps.lng }, "gps");
  }, [fijarOrigen]);

  useEffect(() => {
    if (gps.kind === "ok" && api.kind === "idle") {
      void cargarCartera();
    }
  }, [gps.kind, api.kind, cargarCartera]);

  useEffect(() => {
    if (!rutaMoto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRutaMoto(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rutaMoto]);

  const queryPlaca = normalizarPlaca(busquedaPlaca);
  const buscando = queryPlaca.length > 0;

  const todasConDistancia = useMemo(() => {
    if (gps.kind !== "ok" || api.kind !== "ok") return [] as MotoConDistancia[];
    const origen = gps.origen;
    const lista: MotoConDistancia[] = api.motos.map((m) => ({
      ...m,
      distancia_km: distanciaKm(origen, { lat: m.lat, lng: m.lng }),
    }));
    lista.sort((a, b) => a.distancia_km - b.distancia_km);
    return lista;
  }, [gps, api]);

  const cercanas = useMemo(
    () =>
      todasConDistancia.filter(
        (m) =>
          m.distancia_km <= DISTANCIA_MAX_CERCANAS_KM && tieneDeudaCartera(m),
      ),
    [todasConDistancia],
  );

  const motosVisibles = useMemo(() => {
    if (!buscando) return cercanas;
    return todasConDistancia.filter((m) =>
      normalizarPlaca(m.placa).includes(queryPlaca),
    );
  }, [buscando, cercanas, todasConDistancia, queryPlaca]);

  useEffect(() => {
    if (!buscando) return;
    if (motosVisibles.length === 0) {
      setSeleccionada(null);
      return;
    }
    if (!motosVisibles.some((m) => m.placa === seleccionada)) {
      setSeleccionada(motosVisibles[0].placa);
    }
  }, [buscando, motosVisibles, seleccionada]);

  const radioLabel = `${DISTANCIA_MAX_CERCANAS_KM} km`;

  const statusLive =
    gps.kind === "loading"
      ? "Obteniendo GPS"
      : api.kind === "loading"
        ? "Cargando cartera"
        : gps.kind === "ok" && api.kind === "ok"
          ? buscando
            ? motosVisibles.length === 1
              ? `1 resultado para ${queryPlaca}`
              : `${motosVisibles.length} resultados para ${queryPlaca}`
            : cercanas.length === 1
              ? `1 moto a ${radioLabel}`
              : `${cercanas.length} motos a ${radioLabel}`
          : "";

  const showResults = gps.kind === "ok" && api.kind === "ok";
  const origenLabel =
    gps.kind === "ok" && gps.fuente === "gps"
      ? "Tu ubicación"
      : "Punto de búsqueda";

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {radarMoto ? (
        <BleRadarHud
          targetName={radarMoto.placa}
          placa={radarMoto.placa}
          onClose={() => setRadarMoto(null)}
        />
      ) : null}

      {rutaMoto && gps.kind === "ok" ? (
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
              Motos cercanas
            </h1>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Deuda y AirTag a {radioLabel} del punto que indiques.
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
              aria-label="Actualizar cartera y ubicaciones"
            >
              <RefreshCwIcon
                className={`size-4 ${refrescando ? "animate-spin" : ""}`}
                aria-hidden
              />
            </Button>
          ) : null}
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

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        {gps.kind === "idle" ? (
          <div className="overflow-y-auto px-4">
            <Alert>
              <AlertTitle>Elige un punto</AlertTitle>
              <AlertDescription>
                Usa tu GPS o pega coordenadas (o un enlace de Maps) para ver
                motos con deuda a {radioLabel}.
              </AlertDescription>
            </Alert>
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
              <AlertTitle>No se pudo cargar la cartera</AlertTitle>
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
              Cargando cartera…
            </p>
            <Skeleton className="h-[38dvh] w-full shrink-0 rounded-none lg:mx-4 lg:h-auto lg:min-h-[240px] lg:flex-1 lg:rounded-xl" />
            <div className="px-4 pt-3">
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
          </div>
        ) : null}

        {showResults ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:px-4 lg:pb-4">
            {/* Mapa fijo: no scrollea con la página */}
            <div className="relative w-full shrink-0 lg:h-full lg:w-[55%] lg:flex-1 lg:overflow-hidden lg:rounded-xl lg:border lg:border-border">
              <MapaCercanas
                className="h-[38dvh] rounded-none border-0 lg:h-full lg:min-h-[420px] lg:rounded-xl"
                motos={motosVisibles.map((m) => ({
                  placa: m.placa,
                  lat: m.lat,
                  lng: m.lng,
                  deuda_total: m.deuda_total,
                  distancia_km: m.distancia_km,
                }))}
                origen={gps.origen}
                origenLabel={origenLabel}
                radioKm={DISTANCIA_MAX_CERCANAS_KM}
                seleccionada={seleccionada}
                onSeleccionar={setSeleccionada}
                ajustarAMotos={buscando}
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute end-3 top-3 z-[500] size-11 min-h-[44px] min-w-[44px] shadow-md active:scale-[0.96] lg:hidden"
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

            {/* Solo la lista scrollea */}
            <aside className="flex min-h-0 flex-1 flex-col overflow-hidden lg:w-[45%] lg:max-w-md lg:ps-4">
              <div className="shrink-0 border-b border-border/60 bg-background px-4 py-2.5">
                <p className="text-sm font-medium tabular-nums text-muted-foreground">
                  {statusLive}
                </p>
              </div>

              {motosVisibles.length === 0 ? (
                <div className="flex flex-col gap-3 overflow-y-auto px-4 py-4">
                  <Alert>
                    <AlertTitle>
                      {buscando
                        ? `No hay moneda con placa «${queryPlaca}»`
                        : `No hay motos con deuda a ${radioLabel}`}
                    </AlertTitle>
                    <AlertDescription>
                      {buscando
                        ? "La búsqueda incluye monedas al día. Prueba otra placa o limpia para ver las cercanas con deuda."
                        : "Cambia el punto, acércate a una zona con cartera o busca una placa (aunque no deba)."}
                    </AlertDescription>
                  </Alert>
                  {buscando ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 min-h-[44px] w-full active:scale-[0.96] sm:w-fit"
                      onClick={() => setBusquedaPlaca("")}
                    >
                      Ver cercanas
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 min-h-[44px] w-full active:scale-[0.96] sm:w-fit"
                      onClick={() => void pedirGps()}
                    >
                      Actualizar ubicación
                    </Button>
                  )}
                </div>
              ) : (
                <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain px-4 py-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]">
                  {motosVisibles.map((m) => (
                    <li key={m.placa}>
                      <MotoCercanaCard
                        moto={m}
                        seleccionada={seleccionada === m.placa}
                        onSeleccionar={() => setSeleccionada(m.placa)}
                        onVerEnMapa={() => {
                          setSeleccionada(m.placa);
                          setRutaMoto(m);
                        }}
                        onBuscarCerca={() => {
                          setSeleccionada(m.placa);
                          setRadarMoto(m);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
