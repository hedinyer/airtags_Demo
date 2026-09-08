import assert from "node:assert/strict";

import { parseAppleOfManufacturerData } from "../src/lib/ble/parseOfAd";
import { bandFromRssi } from "../src/lib/ble/rssiBands";

// Separated OF: type 0x12, len 25, status, pubkey_end[22], startMs, hint
const pubkeyEnd = Uint8Array.from({ length: 22 }, (_, i) => i + 1);
const body = new Uint8Array(25);
body[0] = 0x10; // status
body.set(pubkeyEnd, 1);
body[23] = 0x02; // startMs
body[24] = 0x00; // hint
const apple = new Uint8Array(2 + 25);
apple[0] = 0x12;
apple[1] = 25;
apple.set(body, 2);

const parsed = parseAppleOfManufacturerData(apple, null);
assert.equal(parsed?.kind, "separated");
if (parsed?.kind === "separated") {
  assert.equal(parsed.separatedSuffixHex.length, 44);
  assert.equal(parsed.fullKeyHex, null);
}

assert.equal(bandFromRssi(-50), "immediate");
assert.equal(bandFromRssi(-65), "strong");
assert.equal(bandFromRssi(-80), "fair");
assert.equal(bandFromRssi(-95), "weak");
assert.equal(bandFromRssi(-120), "none");

console.log("ble parse/rssi ok");
