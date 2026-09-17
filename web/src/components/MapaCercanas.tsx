"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";

import { formatearCOP } from "@/lib/formatoDinero";
import {
  htmlMarcadorMoto,
  ICON_ANCHOR_MOTO,
  ICON_SIZE_MOTO,
} from "@/lib/marcadorMoto";
import { cn } from "@/lib/utils";

export type PuntoMotoMapa = {
  placa: string;
  lat: number;
  lng: number;
  deuda_total: number;
  distancia_km: number | null;
};

type OrigenMapa = { lat: number; lng: number };

type MapaCercanasProps = {
  motos: PuntoMotoMapa[];
  origen: OrigenMapa;
  radioKm: number;
  seleccionada: string | null;
  onSeleccionar: (placa: string) => void;
  /** Si true, el mapa encuadra origen + motos (útil al buscar fuera del radio). */
  ajustarAMotos?: boolean;
  className?: string;
};

export function MapaCercanas({
  motos,
  origen,
  radioKm,
  seleccionada,
  onSeleccionar,
  ajustarAMotos = false,
  className,
}: MapaCercanasProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const capaMotosRef = useRef<import("leaflet").LayerGroup | null>(null);
  const circuloRef = useRef<import("leaflet").Circle | null>(null);
  const origenMarkerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const marcadoresRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const onSelRef = useRef(onSeleccionar);
  const origenRef = useRef(origen);
  const [mapaListo, setMapaListo] = useState(false);
  onSelRef.current = onSeleccionar;
  origenRef.current = origen;
  const placasKey = motos.map((m) => m.placa).join(",");

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !contenedorRef.current || mapaRef.current) return;

      const o = origenRef.current;
      const mapa = L.map(contenedorRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      }).setView([o.lat, o.lng], 12);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }).addTo(mapa);

      circuloRef.current = L.circle([o.lat, o.lng], {
        radius: radioKm * 1000,
        color: "#38bdf8",
        weight: 1.5,
        fillColor: "#0ea5e9",
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(mapa);

      origenMarkerRef.current = L.circleMarker([o.lat, o.lng], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#38bdf8",
        fillOpacity: 1,
      })
        .bindTooltip("Tu ubicación", { direction: "top" })
        .addTo(mapa);

      capaMotosRef.current = L.layerGroup().addTo(mapa);
      mapaRef.current = mapa;
      setMapaListo(true);

      if (circuloRef.current) {
        mapa.fitBounds(circuloRef.current.getBounds(), {
          padding: [28, 28],
          maxZoom: 14,
          animate: false,
        });
      }
    })();

    return () => {
      cancelado = true;
      const marcadores = marcadoresRef.current;
      mapaRef.current?.remove();
      mapaRef.current = null;
      capaMotosRef.current = null;
      circuloRef.current = null;
      origenMarkerRef.current = null;
      marcadores.clear();
      setMapaListo(false);
    };
  }, [radioKm]);

  useEffect(() => {
    const mapa = mapaRef.current;
    const circulo = circuloRef.current;
    const origenMarker = origenMarkerRef.current;
    if (!mapa || !circulo || !origenMarker) return;
    circulo.setLatLng([origen.lat, origen.lng]);
    origenMarker.setLatLng([origen.lat, origen.lng]);
    if (!ajustarAMotos) {
      mapa.fitBounds(circulo.getBounds(), {
        padding: [28, 28],
        maxZoom: 14,
        animate: true,
      });
    }
  }, [origen.lat, origen.lng, ajustarAMotos]);

  useEffect(() => {
    if (!mapaListo || !capaMotosRef.current) return;
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !capaMotosRef.current) return;

      capaMotosRef.current.clearLayers();
      marcadoresRef.current.clear();

      for (const m of motos) {
        const icon = L.divIcon({
          className: "",
          html: htmlMarcadorMoto(m.placa, m.placa === seleccionada),
          iconSize: ICON_SIZE_MOTO,
          iconAnchor: ICON_ANCHOR_MOTO,
        });
        const marker = L.marker([m.lat, m.lng], { icon });
        marker.bindTooltip(
          `${m.placa} · ${formatearCOP(m.deuda_total)}${
            m.distancia_km != null ? ` · ${m.distancia_km.toFixed(1)} km` : ""
          }`,
          { direction: "top" },
        );
        marker.on("click", () => onSelRef.current(m.placa));
        marker.addTo(capaMotosRef.current!);
        marcadoresRef.current.set(m.placa, marker);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [motos, seleccionada, mapaListo]);

  useEffect(() => {
    if (!mapaListo) return;
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      const mapa = mapaRef.current;
      if (cancelado || !mapa) return;

      if (ajustarAMotos && motos.length > 0) {
        const bounds = L.latLngBounds([
          [origenRef.current.lat, origenRef.current.lng],
          ...motos.map((m) => [m.lat, m.lng] as [number, number]),
        ]);
        mapa.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true });
      } else if (!ajustarAMotos && circuloRef.current) {
        mapa.fitBounds(circuloRef.current.getBounds(), {
          padding: [28, 28],
          maxZoom: 14,
          animate: true,
        });
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [mapaListo, ajustarAMotos, placasKey]);

  useEffect(() => {
    if (!mapaListo || !seleccionada) return;
    const marker = marcadoresRef.current.get(seleccionada);
    if (marker) {
      mapaRef.current?.panTo(marker.getLatLng(), { animate: true });
    }
  }, [seleccionada, mapaListo]);

  return (
    <div
      className={cn(
        "relative min-h-[240px] w-full overflow-hidden rounded-xl border border-border",
        className,
      )}
    >
      <div
        ref={contenedorRef}
        className="absolute inset-0 z-0"
        role="application"
        aria-label="Mapa de motos cercanas"
      />
    </div>
  );
}
