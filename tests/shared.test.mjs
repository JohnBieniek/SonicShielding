import test from "node:test";
import assert from "node:assert/strict";
import { BAND_RANGES, DEFAULT_PROFILE, PROFILE_SCHEMA_VERSION, formatFrequency, formatFrequencyRange, normalizeProfile, reductionToLinearGain } from "../src/shared.js";
import { DSP_CONFIG, findTonalPeaks } from "../src/dsp-config.js";

test("formats frequency labels and ranges", () => {
  assert.equal(formatFrequency(4000), "4 kHz");
  assert.equal(formatFrequencyRange(BAND_RANGES[7]), "5.7 kHz–9.8 kHz");
});

test("turns reduction percentages into linear gain", () => {
  assert.equal(reductionToLinearGain(30), 0.7);
  assert.equal(reductionToLinearGain(100), 0);
});

test("v2 defaults pass audio without permanent EQ", () => {
  assert.equal(DEFAULT_PROFILE.schemaVersion, PROFILE_SCHEMA_VERSION);
  assert.equal(DEFAULT_PROFILE.protectionStrength, "balanced");
  assert.equal(DEFAULT_PROFILE.preserveSpeech, true);
  assert.equal(DEFAULT_PROFILE.comfortEqEnabled, false);
  assert.deepEqual(DEFAULT_PROFILE.comfortEqReductions, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(DEFAULT_PROFILE.outputReduction, 0);
});

test("legacy reductions migrate into disabled optional comfort EQ", () => {
  const profile = normalizeProfile({ thresholds: [-30, 98], output: -10, cap: 70 });
  assert.equal(profile.schemaVersion, 2);
  assert.deepEqual(profile.comfortEqReductions.slice(0, 2), [30, 98]);
  assert.equal(profile.comfortEqEnabled, false);
  assert.equal(profile.outputReduction, 10);
  assert.equal(profile.suddenSoundLimit, 70);
});

test("normalizes detector configuration", () => {
  const profile = normalizeProfile({ schemaVersion: 2, protectionStrength: "invalid", detectionSensitivity: 200, maximumTonalReduction: 1, minimumProtectedFrequency: 9000, releaseDuration: 2 });
  assert.equal(profile.protectionStrength, "balanced");
  assert.equal(profile.detectionSensitivity, 100);
  assert.equal(profile.maximumTonalReduction, 6);
  assert.equal(profile.minimumProtectedFrequency, 5000);
  assert.equal(profile.releaseDuration, 40);
});

test("detects a prominent 3 kHz spectral peak", () => {
  const magnitudes = new Float64Array(DSP_CONFIG.fftSize / 2 + 1).fill(1);
  const bin = Math.round(3000 * DSP_CONFIG.fftSize / 48000);
  magnitudes[bin] = 20;
  const peaks = findTonalPeaks(magnitudes, 48000, { minimumFrequency: 1500, sensitivity: 50, preserveSpeech: true });
  assert.equal(peaks.length, 1);
  assert.ok(Math.abs(peaks[0].frequency - 3000) < 50);
});

test("ignores broadband and quiet non-prominent spectra", () => {
  const flat = new Float64Array(DSP_CONFIG.fftSize / 2 + 1).fill(4);
  assert.deepEqual(findTonalPeaks(flat, 48000, { minimumFrequency: 1500 }), []);
});

test("returns up to three simultaneous alert tones", () => {
  const magnitudes = new Float64Array(DSP_CONFIG.fftSize / 2 + 1).fill(1);
  for (const frequency of [2000, 4000, 6000, 8000]) magnitudes[Math.round(frequency * DSP_CONFIG.fftSize / 48000)] = 30;
  const peaks = findTonalPeaks(magnitudes, 48000, { minimumFrequency: 1500, sensitivity: 70, preserveSpeech: false });
  assert.equal(peaks.length, 3);
});
