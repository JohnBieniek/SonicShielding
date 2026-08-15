import test from "node:test";
import assert from "node:assert/strict";
import { formatFrequency, profileToGains } from "../src/shared.js";

test("formats frequency labels", () => {
  assert.equal(formatFrequency(500), "500 Hz");
  assert.equal(formatFrequency(4000), "4 kHz");
});

test("clamps profile gain values to safe attenuation range", () => {
  assert.deepEqual(profileToGains({ thresholds: [5, -40] }).slice(0, 2), [0, -30]);
});
