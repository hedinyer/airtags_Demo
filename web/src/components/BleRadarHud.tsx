"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RadioIcon, Volume2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { matchBleAdvertisement } from "@/lib/ble/matchClient";
import { playSoundOnDevice } from "@/lib/ble/playSound";
import { bandRank, intensityFromBand } from "@/lib/ble/rssiBands";
import { startFindMyAdScan, type FindMyScanHandle } from "@/lib/ble/scanFindMyAds";
import type { BleProximityBand } from "@/lib/ble/types";
import {
  getWebBluetoothSupport,
  labelBanda,
} from "@/lib/ble/webBluetoothSupport";
import { cn } from "@/lib/utils";

type SoundState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export function BleRadarHud({
  targetName,
  placa,
  onClose,
}: {
  targetName: string;
  placa?: string;
  onClose: () => void;
}) {
  const support = getWebBluetoothSupport();
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [band, setBand] = useState<BleProximityBand>("none");
  const [rssi, setRssi] = useState<number | null>(null);
  const [matched, setMatched] = useState(false);
  const [sound, setSound] = useState<SoundState>({ kind: "idle" });
  const [hint, setHint] = useState("Pulsa Iniciar para usar el Bluetooth del teléfono.");

  const scanRef = useRef<FindMyScanHandle | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const lastMatchAt = useRef(0);
  const lastBandRank = useRef(0);
  const lostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopScan = useCallback(() => {
    scanRef.current?.stop();
    scanRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      stopScan();
      if (lostTimer.current) clearTimeout(lostTimer.current);
    };
  }, [stopScan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onAd = useCallback(
    async (ev: {
      device: BluetoothDevice;
      rssi: number | null;
      manufacturerDataBase64: string;
    }) => {
      const now = Date.now();
      if (now - lastMatchAt.current < 180) return;
      lastMatchAt.current = now;

      try {
        const result = await matchBleAdvertisement({
          manufacturerDataBase64: ev.manufacturerDataBase64,
          rssi: ev.rssi,
          targetName,
        });

        if (!result.matched) {
          return;
        }

        deviceRef.current = ev.device;
        setMatched(true);
        setRssi(result.rssi);
        setBand(result.band);
        setHint("Señal BLE del tag. Camina y mira si sube o baja.");

        const rank = bandRank(result.band);
        if (rank > lastBandRank.current && typeof navigator !== "undefined") {
          try {
            navigator.vibrate?.(rank >= 3 ? [40, 30, 40] : 25);
          } catch {
            /* ignore */
          }
        }
        lastBandRank.current = rank;

        if (lostTimer.current) clearTimeout(lostTimer.current);
        lostTimer.current = setTimeout(() => {
          setMatched(false);
          setBand("none");
          setRssi(null);
          setHint("Señal perdida. Sigue buscando cerca.");
          lastBandRank.current = 0;
        }, 3500);
      } catch (err) {
        setScanError(err instanceof Error ? err.message : "Error al cruzar anuncio");
      }
    },
    [targetName],
  );

  const start = useCallback(async () => {
    setScanError(null);
    setSound({ kind: "idle" });
    setMatched(false);
    setBand("none");
    setRssi(null);
    lastBandRank.current = 0;

    const s = getWebBluetoothSupport();
    if (!s.canScanAds) {
      setScanError(s.reasonIfBlocked || "BLE no disponible");
      return;
    }

    try {
      stopScan();
      const handle = await startFindMyAdScan((ev) => {
        void onAd(ev);
      });
      scanRef.current = handle;
      setScanning(true);
      setHint("Escaneando anuncios Find My… acércate a unos metros.");
    } catch (err) {
      setScanning(false);
      setScanError(
        err instanceof Error ? err.message : "No se pudo iniciar el escaneo BLE",
      );
    }
  }, [onAd, stopScan]);

  const sonar = useCallback(async () => {
    const device = deviceRef.current;
    if (!device || !matched) {
      setSound({
        kind: "error",
        message: "Necesitas señal BLE del tag antes de sonar.",
      });
      return;
    }
    setSound({ kind: "loading" });
    const result = await playSoundOnDevice(device);
    if (result.ok) {
      setSound({ kind: "ok" });
      try {
        navigator.vibrate?.([60, 40, 60]);
      } catch {
        /* ignore */
      }
    } else {
      setSound({ kind: "error", message: result.message });
    }
  }, [matched]);

  const intensity = intensityFromBand(matched ? band : "none");
  const title = placa || targetName;

  return (
    <div
      className="fixed inset-0 z-[600] flex flex-col bg-zinc-950 text-zinc-50"
      role="dialog"
      aria-modal="true"
      aria-label={`Buscar cerca ${title}`}
    >
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
            Radar BLE
          </p>
          <h2 className="truncate text-2xl font-semibold tracking-[0.08em]">
            {title}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 min-h-[44px] min-w-[44px] text-zinc-100"
          onClick={() => {
            stopScan();
            onClose();
          }}
          aria-label="Cerrar radar"
        >
          <XIcon className="size-5" aria-hidden />
        </Button>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6">
        {!support.canScanAds && !scanning ? (
          <div className="max-w-sm text-center">
            <RadioIcon className="mx-auto mb-4 size-10 text-zinc-500" aria-hidden />
            <p className="text-lg font-medium text-balance">
              Bluetooth web no disponible
            </p>
            <p className="mt-2 text-sm text-zinc-400 text-pretty">
              {support.reasonIfBlocked}
            </p>
          </div>
        ) : (
          <>
            <div
              className="relative flex size-[min(72vw,320px)] items-center justify-center"
              aria-hidden
            >
              {[0.35, 0.55, 0.75, 1].map((scale, i) => (
                <span
                  key={scale}
                  className={cn(
                    "absolute rounded-full border border-emerald-400/30",
                    scanning && matched && "animate-pulse",
                  )}
                  style={{
                    width: `${scale * 100}%`,
                    height: `${scale * 100}%`,
                    opacity: 0.15 + intensity * (0.2 + i * 0.1),
                    boxShadow:
                      intensity > 0.5
                        ? `0 0 ${24 * intensity}px rgba(52,211,153,${0.25 * intensity})`
                        : undefined,
                    transform: `scale(${0.92 + intensity * 0.08})`,
                    transition: "opacity 200ms, transform 200ms, box-shadow 200ms",
                  }}
                />
              ))}
              <div
                className={cn(
                  "relative z-10 flex size-28 flex-col items-center justify-center rounded-full border-2",
                  matched
                    ? "border-emerald-400 bg-emerald-500/15"
                    : "border-zinc-600 bg-zinc-900/80",
                )}
                style={{
                  transform: `scale(${0.9 + intensity * 0.25})`,
                  transition: "transform 180ms",
                }}
              >
                <p className="text-xs uppercase tracking-widest text-zinc-400">
                  {matched ? labelBanda(band) : "Buscando"}
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {rssi != null ? `${Math.round(rssi)}` : "—"}
                </p>
                <p className="text-[10px] text-zinc-500">dBm</p>
              </div>
            </div>

            <p className="mt-8 max-w-sm text-center text-sm text-zinc-300 text-pretty">
              {hint}
            </p>
            {scanError ? (
              <p className="mt-3 max-w-sm text-center text-sm text-red-400 text-pretty">
                {scanError}
              </p>
            ) : null}
            {sound.kind === "error" ? (
              <p className="mt-2 max-w-sm text-center text-sm text-amber-300 text-pretty">
                {sound.message}
              </p>
            ) : null}
            {sound.kind === "ok" ? (
              <p className="mt-2 text-sm text-emerald-300">Sonido enviado.</p>
            ) : null}
          </>
        )}
      </div>

      <footer className="flex flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {support.canScanAds ? (
          <div className="flex gap-2">
            <Button
              type="button"
              className="h-12 min-h-[48px] flex-1 active:scale-[0.96]"
              onClick={() => void (scanning ? stopScan() : start())}
            >
              <RadioIcon className="mr-1.5 size-4" aria-hidden />
              {scanning ? "Detener" : "Iniciar radar"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-12 min-h-[48px] flex-1 active:scale-[0.96]"
              disabled={!matched || sound.kind === "loading" || !scanning}
              onClick={() => void sonar()}
            >
              <Volume2Icon className="mr-1.5 size-4" aria-hidden />
              {sound.kind === "loading" ? "Sonando…" : "Sonar"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="h-12 min-h-[48px] w-full"
            onClick={onClose}
          >
            Volver
          </Button>
        )}
        <p className="text-center text-[11px] text-zinc-500">
          Solo proximidad BLE (no es Precision Finding UWB). Android + Chrome.
        </p>
      </footer>
    </div>
  );
}
