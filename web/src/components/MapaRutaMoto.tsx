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

export function MapaRutaMoto({
  placa,
  lat,
  lng,
  origen,
  onVolver,
}: MapaRutaMotoProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const [meta, setMeta] = useState<string>("Calculando ruta…");

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !contenedorRef.current) return;

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

      L.circleMarker([origen.lat, origen.lng], {
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

      const ruta = await obtenerRutaOsrm(origen, { lat, lng });
      if (cancelado) return;

      const latlngs = ruta.coords.map(
        (c) => [c.lat, c.lng] as [number, number],
      );
      const linea = L.polyline(latlngs, {
        color: "#38bdf8",
        weight: 5,
        opacity: 0.9,
      }).addTo(mapa);

      mapa.fitBounds(linea.getBounds(), {
        padding: [48, 48],
        maxZoom: 16,
        animate: false,
      });

      setMeta(
        `${formatearDistanciaRuta(ruta.distance_m)} · ${formatearDuracionRuta(ruta.duration_s)}`,
      );

      // Leaflet a veces necesita invalidateSize en fullscreen overlay
      requestAnimationFrame(() => mapa.invalidateSize());
    })();

    return () => {
      cancelado = true;
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
  }, [placa, lat, lng, origen.lat, origen.lng]);

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
