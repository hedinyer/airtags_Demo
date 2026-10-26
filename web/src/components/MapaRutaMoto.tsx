"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, NavigationIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  htmlMarcadorMoto,
  ICON_ANCHOR_MOTO,
  ICON_SIZE_MOTO,
} from "@/lib/marcadorMoto";
import { distanciaKm } from "@/lib/distancia";
import { enlaceGoogleMapsRuta } from "@/lib/geolocation";
import {
  formatearDistanciaRuta,
  formatearDuracionRuta,
  obtenerRutaOsrm,
} from "@/lib/rutaOsrm";

type Origen = { lat: number; lng: number };

type MapaRutaMotoProps = {
  placa: string;
  lat: number;
  lng: number;
  origen: Origen;
  onVolver: () => void;
};

const RUTA_RECACLULO_KM = 0.05;

function usarAnimacionMapa(): boolean {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MapaRutaMoto({
  placa,
  lat,
  lng,
  origen,
  onVolver,
}: MapaRutaMotoProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const origenMarkerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const lineaRef = useRef<import("leaflet").Polyline | null>(null);
  const origenRutaRef = useRef<Origen | null>(null);
  const encuadradoRef = useRef(false);
  const [meta, setMeta] = useState<string>("Calculando ruta…");
  const [mapaListo, setMapaListo] = useState(false);
  const origenRef = useRef(origen);
  origenRef.current = origen;

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !contenedorRef.current || mapaRef.current) return;

      const mapa = L.map(contenedorRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      }).setView([lat, lng], 14);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }).addTo(mapa);

      const o = origenRef.current;
      origenMarkerRef.current = L.circleMarker([o.lat, o.lng], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#38bdf8",
        fillOpacity: 1,
      })
        .bindTooltip("Tú", { direction: "top" })
        .addTo(mapa);

      const icon = L.divIcon({
        className: "",
        html: htmlMarcadorMoto(placa, true),
        iconSize: ICON_SIZE_MOTO,
        iconAnchor: ICON_ANCHOR_MOTO,
      });
      L.marker([lat, lng], { icon })
        .bindTooltip(placa, { direction: "top" })
        .addTo(mapa);

      mapaRef.current = mapa;
      setMapaListo(true);
      requestAnimationFrame(() => mapa.invalidateSize());
    })();

    return () => {
      cancelado = true;
      lineaRef.current?.remove();
      lineaRef.current = null;
      origenMarkerRef.current = null;
      mapaRef.current?.remove();
      mapaRef.current = null;
      origenRutaRef.current = null;
      encuadradoRef.current = false;
      setMapaListo(false);
    };
  }, [placa, lat, lng]);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const mapa = mapaRef.current;
      const origenMarker = origenMarkerRef.current;
      if (!mapaListo || !mapa || !origenMarker) return;

      origenMarker.setLatLng([origen.lat, origen.lng]);

      const prevOrigen = origenRutaRef.current;
      const necesitaRuta =
        !prevOrigen ||
        distanciaKm(prevOrigen, origen) >= RUTA_RECACLULO_KM ||
        !lineaRef.current;

      if (!necesitaRuta) {
        if (encuadradoRef.current) {
          mapa.panTo([origen.lat, origen.lng], {
            animate: usarAnimacionMapa(),
          });
        }
        return;
      }

      setMeta("Calculando ruta…");
      const ruta = await obtenerRutaOsrm(origen, { lat, lng });
      if (cancelado || !mapaRef.current) return;

      lineaRef.current?.remove();
      const L = (await import("leaflet")).default;
      const latlngs = ruta.coords.map(
        (c) => [c.lat, c.lng] as [number, number],
      );
      lineaRef.current = L.polyline(latlngs, {
        color: "#38bdf8",
        weight: 5,
        opacity: 0.9,
      }).addTo(mapaRef.current);

      if (!encuadradoRef.current) {
        mapaRef.current.fitBounds(lineaRef.current.getBounds(), {
          padding: [48, 48],
          maxZoom: 16,
          animate: false,
        });
        encuadradoRef.current = true;
      } else {
        mapaRef.current.panTo([origen.lat, origen.lng], {
          animate: usarAnimacionMapa(),
        });
      }

      origenRutaRef.current = { lat: origen.lat, lng: origen.lng };
      setMeta(
        `${formatearDistanciaRuta(ruta.distance_m)} · ${formatearDuracionRuta(ruta.duration_s)}`,
      );
    })();

    return () => {
      cancelado = true;
    };
  }, [origen.lat, origen.lng, lat, lng, mapaListo]);

  const maps = enlaceGoogleMapsRuta(origen, { lat, lng });

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={`Ruta a ${placa}`}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Button
          type="button"
          variant="outline"
          className="h-11 min-h-[44px] gap-1.5 active:scale-[0.96]"
          onClick={onVolver}
          aria-label="Volver a la lista"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          Volver
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold tracking-[0.1em] text-foreground">
            {placa}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">{meta}</p>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <div
          ref={contenedorRef}
          className="absolute inset-0"
          role="application"
          aria-label={`Mapa de ruta a ${placa}`}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card/95 px-3.5 py-3 shadow-lg backdrop-blur-sm">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {meta}
              </p>
              <p className="text-xs text-muted-foreground">
                Ruta en coche · se actualiza al moverte
              </p>
            </div>
            <Button
              type="button"
              className="h-11 min-h-[44px] shrink-0 active:scale-[0.96]"
              asChild
            >
              <a href={maps} target="_blank" rel="noopener noreferrer">
                <NavigationIcon className="mr-1.5 size-4" aria-hidden />
                Navegar
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
