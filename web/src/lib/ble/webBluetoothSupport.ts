import type { WebBluetoothSupport } from "@/lib/ble/types";

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
}

function detectAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

export function getWebBluetoothSupport(): WebBluetoothSupport {
  const secureContext =
    typeof window !== "undefined" ? window.isSecureContext : false;
  const bt = typeof navigator !== "undefined" ? navigator.bluetooth : undefined;
  const hasBluetooth = !!bt;
  const hasRequestDevice = typeof bt?.requestDevice === "function";
  const hasRequestLEScan = typeof bt?.requestLEScan === "function";
  const isIos = detectIos();
  const isAndroid = detectAndroid();

  let reasonIfBlocked: string | null = null;
  if (!secureContext) {
    reasonIfBlocked =
      "Abre la app por HTTPS (o localhost). Web Bluetooth exige contexto seguro.";
  } else if (isIos) {
    reasonIfBlocked =
      "En iPhone/iPad Safari no hay Web Bluetooth nativo. Usa Android con Chrome, o una extensión tipo beacio.";
  } else if (!hasBluetooth || !hasRequestDevice) {
    reasonIfBlocked =
      "Este navegador no expone Web Bluetooth. En Android abre la app con Chrome.";
  } else if (!hasRequestLEScan) {
    reasonIfBlocked =
      "Tu Chrome no tiene escaneo de anuncios BLE (requestLEScan). Actualiza Chrome o activa chrome://flags/#enable-experimental-web-platform-features.";
  }

  const canScanAds = !!(secureContext && hasRequestLEScan && !isIos);
  const canConnectGatt = !!(secureContext && hasRequestDevice && !isIos);

  return {
    secureContext,
    hasBluetooth,
    hasRequestDevice,
    hasRequestLEScan,
    canScanAds,
    canConnectGatt,
    isIos,
    isAndroid,
    reasonIfBlocked: canScanAds ? null : reasonIfBlocked,
  };
}

export function labelBanda(band: string): string {
  switch (band) {
    case "immediate":
      return "Encima";
    case "strong":
      return "Cerca";
    case "fair":
      return "Medio";
    case "weak":
      return "Lejos";
    default:
      return "Sin señal";
  }
}
