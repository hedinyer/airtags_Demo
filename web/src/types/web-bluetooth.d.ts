/* Ambient Web Bluetooth (+ Scanning) — no incluido en lib DOM por defecto. */

interface BluetoothManufacturerDataFilter {
  companyIdentifier: number;
  dataPrefix?: BufferSource;
  mask?: BufferSource;
}

interface BluetoothLEScanFilter {
  name?: string;
  namePrefix?: string;
  services?: BluetoothServiceUUID[];
  manufacturerData?: BluetoothManufacturerDataFilter[];
}

interface RequestDeviceOptions {
  filters?: BluetoothLEScanFilter[];
  optionalServices?: BluetoothServiceUUID[];
  acceptAllDevices?: boolean;
}

interface BluetoothLEScanOptions {
  filters?: BluetoothLEScanFilter[];
  keepRepeatedDevices?: boolean;
  acceptAllAdvertisements?: boolean;
}

interface BluetoothLEScan {
  readonly active: boolean;
  readonly acceptAllAdvertisements: boolean;
  readonly keepRepeatedDevices: boolean;
  readonly filters: BluetoothLEScanFilter[];
  stop(): void;
}

interface BluetoothAdvertisingEvent extends Event {
  readonly device: BluetoothDevice;
  readonly rssi: number;
  readonly txPower?: number;
  readonly manufacturerData: Map<number, DataView>;
  readonly serviceData: Map<string, DataView>;
  readonly uuids: string[];
}

type BluetoothServiceUUID = string | number;

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string | null;
  readonly gatt?: BluetoothRemoteGATTServer | null;
  watchAdvertisements?(): Promise<void>;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  readonly device: BluetoothDevice;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(
    service: BluetoothServiceUUID,
  ): Promise<BluetoothRemoteGATTService>;
  getPrimaryServices(
    service?: BluetoothServiceUUID,
  ): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothRemoteGATTService {
  readonly device: BluetoothDevice;
  readonly uuid: string;
  getCharacteristic(
    characteristic: BluetoothServiceUUID,
  ): Promise<BluetoothRemoteGATTCharacteristic>;
  getCharacteristics(
    characteristic?: BluetoothServiceUUID,
  ): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothCharacteristicProperties {
  readonly broadcast: boolean;
  readonly read: boolean;
  readonly writeWithoutResponse: boolean;
  readonly write: boolean;
  readonly notify: boolean;
  readonly indicate: boolean;
  readonly authenticatedSignedWrites: boolean;
  readonly reliableWrite: boolean;
  readonly writableAuxiliaries: boolean;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly service: BluetoothRemoteGATTService;
  readonly uuid: string;
  readonly properties: BluetoothCharacteristicProperties;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}

interface Bluetooth extends EventTarget {
  getAvailability(): Promise<boolean>;
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
  requestLEScan?(options?: BluetoothLEScanOptions): Promise<BluetoothLEScan>;
  getDevices?(): Promise<BluetoothDevice[]>;
  addEventListener(
    type: "advertisementreceived",
    listener: (this: Bluetooth, ev: BluetoothAdvertisingEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: "advertisementreceived",
    listener: (this: Bluetooth, ev: BluetoothAdvertisingEvent) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

interface Navigator {
  bluetooth?: Bluetooth;
}
