"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";
import { LocateFixedIcon } from "lucide-react";

import { DISTANCIA_CAMPO_KM } from "@/lib/campoConstants";
import { formatearCOP } from "@/lib/formatoDinero";
import {
  htmlMarcadorMotoAsignada,
  htmlMarcadorOperador,
} from "@/lib/marcadorCampo";
import {
  htmlMarcadorMoto,
  ICON_ANCHOR_MOTO,
  ICON_SIZE_MOTO,
} from "@/lib/marcadorMoto";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type PuntoMotoCampo = {
  placa: string;
  lat: number;
  lng: number;
  deuda_total: number;
  distancia_km: number | null;
  asignada?: boolean;
};

type PuntoOperador = { lat: number; lng: number; label: string; color: string };

type MapaCampoProps = {
  motos: PuntoMotoCampo[];
  centro: { lat: number; lng: number };
  radioKm?: number;
  operadores?: PuntoOperador[];
  seleccionada: string | null;
  onSeleccionar: (placa: string) => void;
  ariaLabel: string;
  className?: string;
};

function usarAnimacionMapa(): boolean {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MapaCampo({
  motos,
  centro,
  radioKm = DISTANCIA_CAMPO_KM,
  operadores = [],
  seleccionada,
  onSeleccionar,
  ariaLabel,
  className,
}: MapaCampoProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const capaMotosRef = useRef<import("leaflet").LayerGroup | null>(null);
  const capaOpsRef = useRef<import("leaflet").LayerGroup | null>(null);
  const circuloRef = useRef<import("leaflet").Circle | null>(null);
  const marcadoresRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const onSelRef = useRef(onSeleccionar);
  const centroRef = useRef(centro);
  const encuadradoRef = useRef(false);
  const seguirCentroRef = useRef(true);
  const movimientoProgramaticoRef = useRef(false);
  const [seguirCentro, setSeguirCentro] = useState(true);
  const [mapaListo, setMapaListo] = useState(false);
  onSelRef.current = onSeleccionar;
  centroRef.current = centro;
  seguirCentroRef.current = seguirCentro;
  const placasKey = motos.map((m) => `${m.placa}:${m.asignada}`).join(",");

  const encuadrarCentro = (animate: boolean) => {
    const circulo = circuloRef.current;
    const mapa = mapaRef.current;
    if (!mapa || !circulo) return;
    movimientoProgramaticoRef.current = true;
    mapa.fitBounds(circulo.getBounds(), {
      padding: [28, 28],
      maxZoom: 14,
      animate: animate && usarAnimacionMapa(),
    });
    encuadradoRef.current = true;
  };

  const moverCentro = (animate: boolean) => {
    const circulo = circuloRef.current;
    const mapa = mapaRef.current;
    if (!mapa || !circulo) return;

    circulo.setLatLng([centro.lat, centro.lng]);

    if (!encuadradoRef.current) {
      encuadrarCentro(false);
      return;
    }

    if (!seguirCentroRef.current) return;

    movimientoProgramaticoRef.current = true;
    mapa.panTo([centro.lat, centro.lng], {
      animate: animate && usarAnimacionMapa(),
    });
  };

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !contenedorRef.current || mapaRef.current) return;

      const c = centroRef.current;
      const mapa = L.map(contenedorRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      }).setView([c.lat, c.lng], 12);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }).addTo(mapa);

      circuloRef.current = L.circle([c.lat, c.lng], {
        radius: radioKm * 1000,
        color: "#f97316",
        weight: 1.5,
        fillColor: "#f97316",
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(mapa);

      capaOpsRef.current = L.layerGroup().addTo(mapa);
      capaMotosRef.current = L.layerGroup().addTo(mapa);
      mapaRef.current = mapa;
      setMapaListo(true);

      mapa.on("dragstart", () => {
        seguirCentroRef.current = false;
        setSeguirCentro(false);
      });
      mapa.on("zoomend", () => {
        if (movimientoProgramaticoRef.current) {
          movimientoProgramaticoRef.current = false;
          return;
        }
        seguirCentroRef.current = false;
        setSeguirCentro(false);
      });

      encuadrarCentro(false);
    })();

    return () => {
      cancelado = true;
      marcadoresRef.current.clear();
      mapaRef.current?.remove();
      mapaRef.current = null;
      capaMotosRef.current = null;
      capaOpsRef.current = null;
      circuloRef.current = null;
      encuadradoRef.current = false;
      setMapaListo(false);
    };
  }, [radioKm]);

  useEffect(() => {
    if (!mapaRef.current || !circuloRef.current) return;
    moverCentro(true);
  }, [centro.lat, centro.lng]);

  useEffect(() => {
    if (!mapaListo || !capaOpsRef.current) return;
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !capaOpsRef.current) return;

      capaOpsRef.current.clearLayers();
      for (const op of operadores) {
        const icon = L.divIcon({
          className: "",
          html: htmlMarcadorOperador(op.label, op.color),
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        });
        L.marker([op.lat, op.lng], { icon, zIndexOffset: 1000 })
          .bindTooltip(op.label, { direction: "top" })
          .addTo(capaOpsRef.current);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [operadores, mapaListo]);

  useEffect(() => {
    if (!mapaListo || !capaMotosRef.current) return;
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !capaMotosRef.current) return;

      capaMotosRef.current.clearLayers();
      marcadoresRef.current.clear();

      for (const m of motos) {
        const html = m.asignada
          ? htmlMarcadorMotoAsignada(m.placa, m.placa === seleccionada)
          : htmlMarcadorMoto(m.placa, m.placa === seleccionada);
        const icon = L.divIcon({
          className: "",
          html,
          iconSize: ICON_SIZE_MOTO,
          iconAnchor: ICON_ANCHOR_MOTO,
        });
        const marker = L.marker([m.lat, m.lng], { icon });
        marker.bindTooltip(
          `${m.placa}${m.asignada ? " · asignada" : ""} · ${formatearCOP(m.deuda_total)}${
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
  }, [motos, seleccionada, mapaListo, placasKey]);

  useEffect(() => {
    if (!mapaListo || !seleccionada) return;
    const marker = marcadoresRef.current.get(seleccionada);
    if (marker) {
      mapaRef.current?.panTo(marker.getLatLng(), {
        animate: usarAnimacionMapa(),
      });
    }
  }, [seleccionada, mapaListo]);

  const reactivarSeguimiento = () => {
    seguirCentroRef.current = true;
    setSeguirCentro(true);
    encuadrarCentro(usarAnimacionMapa());
  };

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
        aria-label={ariaLabel}
      />
      {!seguirCentro ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="absolute end-3 top-3 z-10 h-11 min-h-[44px] gap-1.5 shadow-md"
          onClick={reactivarSeguimiento}
          aria-pressed={false}
          aria-label="Seguir posición en el mapa"
        >
          <LocateFixedIcon className="size-4" aria-hidden />
          Seguir posición
        </Button>
      ) : null}
    </div>
  );
}
