/** Characteristic pública usada por el PoC FindMy.py / AirGuard (no autenticada). */
export const SOUND_CHARACTERISTIC_UUID =
  "4f860003-943b-49ef-bed4-2f730304427a";

const SOUND_PAYLOAD = new Uint8Array([1, 0, 3]);

export type PlaySoundResult =
  | { ok: true }
  | { ok: false; code: "no_gatt" | "connect" | "not_found" | "write" | "busy"; message: string };

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Intenta hacer sonar el accesorio vía GATT desde el navegador.
 * Requiere el BluetoothDevice del anuncio BLE.
 */
export async function playSoundOnDevice(
  device: BluetoothDevice,
): Promise<PlaySoundResult> {
  if (!device.gatt) {
    return {
      ok: false,
      code: "no_gatt",
      message: "Este dispositivo no expone GATT en el navegador.",
    };
  }

  let server: BluetoothRemoteGATTServer;
  try {
    server = device.gatt.connected
      ? device.gatt
      : await device.gatt.connect();
  } catch (err) {
    return {
      ok: false,
      code: "connect",
      message: `No se pudo conectar por Bluetooth: ${errorMessage(err)}`,
    };
  }

  try {
    let characteristic: BluetoothRemoteGATTCharacteristic | null = null;

    try {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        try {
          characteristic = await service.getCharacteristic(
            SOUND_CHARACTERISTIC_UUID,
          );
          if (characteristic) break;
        } catch {
          /* next service */
        }
      }
    } catch {
      /* fall through */
    }

    if (!characteristic) {
      try {
        // Algunos stacks permiten UUID de characteristic “sueltos” vía servicio desconocido
        const services = await server.getPrimaryServices();
        for (const service of services) {
          const chars = await service.getCharacteristics();
          const hit = chars.find((c: BluetoothRemoteGATTCharacteristic) =>
            c.uuid.replace(/-/g, "").toLowerCase() ===
            SOUND_CHARACTERISTIC_UUID.replace(/-/g, "").toLowerCase(),
          );
          if (hit) {
            characteristic = hit;
            break;
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (!characteristic) {
      return {
        ok: false,
        code: "not_found",
        message:
          "Este tag no expone la characteristic de sonido por BLE (común en monedas de terceros o con el dueño cerca).",
      };
    }

    try {
      if (characteristic.properties.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(SOUND_PAYLOAD);
      } else {
        await characteristic.writeValueWithResponse(SOUND_PAYLOAD);
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        code: "write",
        message: `Falló el write GATT: ${errorMessage(err)}`,
      };
    }
  } finally {
    try {
      if (device.gatt.connected) device.gatt.disconnect();
    } catch {
      /* ignore */
    }
  }
}
