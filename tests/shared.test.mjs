import test from "node:test";
import assert from "node:assert/strict";
import { BAND_RANGES, DEFAULT_PROFILE, formatFrequency, formatFrequencyRange, frequenciesForRange, levelToDecibels, normalizeProfile, profileToGains, reductionToFilterSettings, reductionToLinearGain } from "../src/shared.js";

test("formats frequency labels", () => {
  assert.equal(formatFrequency(500), "500 Hz");
  assert.equal(formatFrequency(4000), "4 kHz");
});

test("formats frequency controls as ranges", () => {
  assert.equal(formatFrequencyRange(BAND_RANGES[0]), "45 Hz–90 Hz");
  assert.equal(formatFrequencyRange(BAND_RANGES[7]), "5.7 kHz–9.8 kHz");
});

test("turns reduction percentages into linear gain", () => {
  assert.equal(reductionToLinearGain(30), 0.7);
  assert.equal(reductionToLinearGain(100), 0);
  assert.equal(reductionToLinearGain(120), 0);
});

test("defaults to the requested frequency reduction curve", () => {
  assert.deepEqual(DEFAULT_PROFILE.thresholds, [0, 0, 0, 0, 97, 98, 99, 100, 100]);
  assert.equal(DEFAULT_PROFILE.output, 0);
});

test("converts legacy negative slider values to percentages", () => {
  const profile = normalizeProfile({ thresholds: [-30], output: -10 });
  assert.equal(profile.thresholds[0], 30);
  assert.equal(profile.output, 10);
});

test("converts percentages to the decibels required by equalizer filters", () => {
  assert.ok(Math.abs(profileToGains({ thresholds: [50] })[0] + 6.0206) < 0.001);
});

test("converts a digital level cap for the limiter", () => {
  assert.ok(Math.abs(levelToDecibels(50) + 6.0206) < 0.001);
  assert.equal(levelToDecibels(0), -100);
  assert.equal(normalizeProfile({}).cap, 100);
});

test("keeps deep frequency cuts narrow", () => {
  assert.deepEqual(reductionToFilterSettings(100), { type: "notch", gain: 0, q: 4 });
  assert.equal(reductionToFilterSettings(0).q, 4);
  assert.ok(reductionToFilterSettings(99).q > 39.9);
});

test("spreads filters across each displayed range", () => {
  const frequencies = frequenciesForRange(BAND_RANGES[7]);
  assert.equal(frequencies.length, 3);
  assert.ok(frequencies[0] > 5700);
  assert.ok(frequencies[2] > 9000 && frequencies[2] < 9800);
});
