"use client";

import { MapIcon, NavigationIcon, PhoneIcon, RadioIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { diasDesde, haceCuanto } from "@/lib/fechas";
import { formatearDistancia } from "@/lib/distancia";
import { formatearCOP } from "@/lib/formatoDinero";
import { cn } from "@/lib/utils";

export type MotoCercanaCardData = {
  placa: string;
  nombre: string;
  telefono: string;
  deuda_total: number;
  fecha_inicio: string;
  cuotas_pagadas: number;
  cuotas_pendientes: number;
  lat: number;
  lng: number;
  distancia_km: number | null;
  visto_en: string | null;
};

function enlaceMaps(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

function enlaceTel(telefono: string): string | null {
  const digits = telefono.replace(/\D/g, "");
  if (!digits) return null;
  return `tel:${digits}`;
}

function formatearCuotas(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function MotoCercanaCard({
  moto,
  seleccionada,
  onSeleccionar,
  onVerEnMapa,
  onBuscarCerca,
  bleCerca = false,
}: {
  moto: MotoCercanaCardData;
  seleccionada: boolean;
  onSeleccionar: () => void;
  onVerEnMapa: () => void;
  onBuscarCerca?: () => void;
  bleCerca?: boolean;
}) {
  const diasMoto = diasDesde(moto.fecha_inicio);
  const maps = enlaceMaps(moto.lat, moto.lng);
  const tel = enlaceTel(moto.telefono);
  const actualizado = haceCuanto(moto.visto_en);

  return (
    <Card
      className={cn(
        "gap-0 rounded-2xl border-border/80 bg-card py-0 shadow-none",
        seleccionada && "border-primary ring-2 ring-primary/30",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 px-3.5 pb-2 pt-3.5">
        <button
          type="button"
          className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={onSeleccionar}
          aria-pressed={seleccionada}
          aria-label={`Seleccionar ${moto.placa}${moto.distancia_km != null ? `, a ${formatearDistancia(moto.distancia_km)}` : ""}`}
        >
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold tracking-[0.12em] text-foreground">
              {moto.placa}
            </p>
            {bleCerca ? (
              <Badge
                variant="secondary"
                className="rounded-md px-1.5 py-0 text-[10px] uppercase tracking-wide"
              >
                BLE cerca
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground/90">
            {moto.nombre || "Sin nombre"}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {formatearDistancia(moto.distancia_km)}
          </p>
          <p className="mt-1 text-sm font-medium tabular-nums text-amber-300">
            Moneda {actualizado}
          </p>
        </button>
      </CardHeader>

      <CardContent className="px-3.5 pb-3">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Debe</p>
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                moto.deuda_total > 0
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {moto.deuda_total > 0 ? formatearCOP(moto.deuda_total) : "Al día"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Con moto</p>
            <p className="text-sm font-semibold tabular-nums">
              {diasMoto != null ? `${diasMoto}d` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cuotas pagas</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatearCuotas(moto.cuotas_pagadas)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cuotas debe</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatearCuotas(moto.cuotas_pendientes)}
            </p>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-2 px-3.5 pb-3.5 pt-0">
        <Button
          type="button"
          className="h-11 min-h-[44px] w-full rounded-lg active:scale-[0.96]"
          onClick={(e) => {
            e.stopPropagation();
            onVerEnMapa();
          }}
        >
          <MapIcon className="mr-1.5 size-4" aria-hidden />
          Ver en mapa
        </Button>
        {onBuscarCerca ? (
          <Button
            type="button"
            variant="secondary"
            className="h-11 min-h-[44px] w-full rounded-lg active:scale-[0.96]"
            onClick={(e) => {
              e.stopPropagation();
              onBuscarCerca();
            }}
          >
            <RadioIcon className="mr-1.5 size-4" aria-hidden />
            Buscar cerca (BLE)
          </Button>
        ) : null}
        <div className="flex w-full gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-11 min-h-[44px] flex-1 rounded-lg active:scale-[0.96]"
            asChild
          >
            <a href={maps} target="_blank" rel="noopener noreferrer">
              <NavigationIcon className="mr-1.5 size-4" aria-hidden />
              Ir en Maps
            </a>
          </Button>
          {tel ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-[44px] min-w-[44px] shrink-0 rounded-lg active:scale-[0.96]"
              aria-label={`Llamar ${moto.placa}`}
              asChild
            >
              <a href={tel}>
                <PhoneIcon className="size-4" aria-hidden />
              </a>
            </Button>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  );
}
