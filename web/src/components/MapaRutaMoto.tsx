"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  htmlMarcadorMoto,
  ICON_ANCHOR_MOTO,
  ICON_SIZE_MOTO,
} from "@/lib/marcadorMoto";
import { distanciaKm } from "@/lib/distancia";
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

      origenMarkerRef.current = L.circleMarker([origen.lat, origen.lng], {
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
    };
  }, [placa, lat, lng]);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const mapa = mapaRef.current;
      const origenMarker = origenMarkerRef.current;
      if (!mapa || !origenMarker) return;

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
  }, [origen.lat, origen.lng, lat, lng]);

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
      <div
        ref={contenedorRef}
        className="min-h-0 flex-1"
        role="application"
        aria-label={`Mapa de ruta a ${placa}`}
      />
    </div>
  );
}
