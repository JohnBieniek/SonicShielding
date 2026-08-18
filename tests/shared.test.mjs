import test from "node:test";
import assert from "node:assert/strict";
import { BAND_RANGES, DEFAULT_PROFILE, DETECTOR_REVISION, PROFILE_SCHEMA_VERSION, formatFrequency, formatFrequencyRange, normalizeProfile, reductionToLinearGain } from "../src/shared.js";
import { DSP_CONFIG, findTonalPeaks, isAlarmSignature } from "../src/dsp-config.js";

test("formats frequency labels and ranges", () => {
  assert.equal(formatFrequency(4000), "4 kHz");
  assert.equal(formatFrequencyRange(BAND_RANGES[7]), "5.7 kHz–9.8 kHz");
});

test("turns reduction percentages into linear gain", () => {
  assert.equal(reductionToLinearGain(30), 0.7);
  assert.equal(reductionToLinearGain(100), 0);
});

test("current defaults pass audio without permanent EQ", () => {
  assert.equal(DEFAULT_PROFILE.schemaVersion, PROFILE_SCHEMA_VERSION);
  assert.equal(DEFAULT_PROFILE.protectionStrength, "strong");
  assert.equal(DEFAULT_PROFILE.aggressiveAlarmBlocking, false);
  assert.equal(DEFAULT_PROFILE.detectionSensitivity, 95);
  assert.equal(DEFAULT_PROFILE.suddenSoundReductionPercent, 50);
  assert.equal(DEFAULT_PROFILE.preserveSpeech, true);
  assert.equal(DEFAULT_PROFILE.comfortEqEnabled, false);
  assert.deepEqual(DEFAULT_PROFILE.comfortEqReductions, [0, 0, 0, 0, 97, 98, 99, 100, 100]);
  assert.equal(DEFAULT_PROFILE.maximumTonalReductionPercent, 99);
});

test("legacy profiles receive the original master EQ curve while it stays disabled", () => {
  const profile = normalizeProfile({ thresholds: [-30, 98], output: -10, cap: 70 });
  assert.equal(profile.schemaVersion, 6);
  assert.equal(profile.detectorRevision, DETECTOR_REVISION);
  assert.deepEqual(profile.comfortEqReductions, [0, 0, 0, 0, 97, 98, 99, 100, 100]);
  assert.equal(profile.comfortEqEnabled, false);
  assert.equal(profile.suddenSoundReductionPercent, 50);
  assert.equal(Object.hasOwn(profile, "outputReduction"), false);
});

test("normalizes detector configuration", () => {
  const profile = normalizeProfile({ schemaVersion: 6, detectorRevision: 4, comfortEqRevision: 1, suddenSoundRevision: 1, protectionStrength: "invalid", aggressiveAlarmBlocking: true, preserveSpeech: false, detectionSensitivity: 200, maximumTonalReductionPercent: -1, minimumProtectedFrequency: 9000, releaseDuration: 2 });
  assert.equal(profile.protectionStrength, "strong");
  assert.equal(profile.aggressiveAlarmBlocking, true);
  assert.equal(profile.preserveSpeech, false);
  assert.equal(profile.detectionSensitivity, 100);
  assert.equal(profile.maximumTonalReductionPercent, 0);
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

test("returns multiple simultaneous alert tones", () => {
  const magnitudes = new Float64Array(DSP_CONFIG.fftSize / 2 + 1).fill(1);
  for (const frequency of [2000, 4000, 6000, 8000]) magnitudes[Math.round(frequency * DSP_CONFIG.fftSize / 48000)] = 30;
  const peaks = findTonalPeaks(magnitudes, 48000, { minimumFrequency: 1500, sensitivity: 70, preserveSpeech: false });
  assert.equal(peaks.length, 4);
});

test("speech preservation rejects voiced harmonics as an aggressive alarm", () => {
  const stable = frequency => ({ frequency, frames: 6 });
  assert.equal(isAlarmSignature([1200, 2400, 3600, 4800].map(stable), true), false);
  assert.equal(isAlarmSignature([4125, 5953, 10359].map(frequency => ({ frequency, frames: 2 })), true), false);
  assert.equal(isAlarmSignature([4125, 5953, 10359].map(stable), true), true);
  assert.equal(isAlarmSignature([2400, 3600].map(stable), false), true);
});

test("strong defaults cover the measured layered reference beep", () => {
  const profile = normalizeProfile(DEFAULT_PROFILE);
  assert.equal(profile.minimumProtectedFrequency, 1000);
  assert.equal(profile.maximumTonalReductionPercent, 99);
  assert.equal(DSP_CONFIG.lookaheadMs, 40);
  assert.equal(DSP_CONFIG.maximumNotches, 6);
  assert.equal(DSP_CONFIG.notchQ, 8);
  assert.equal(DSP_CONFIG.attackMs, 4);
  assert.equal(DSP_CONFIG.aggressiveNotchQ, 4.5);
  assert.equal(DSP_CONFIG.aggressiveAttackMs, 2);
  assert.equal(DSP_CONFIG.alarmDuckingMinimumPeaks, 2);
  assert.equal(DSP_CONFIG.speechSafeAlarmMinimumPeaks, 3);
  assert.equal(DSP_CONFIG.speechSafeAlarmHighFrequency, 5000);
  assert.equal(DSP_CONFIG.speechSafeAlarmMinimumHighPeaks, 2);
  assert.equal(DSP_CONFIG.speechSafeAlarmVeryHighFrequency, 9000);
  assert.equal(DSP_CONFIG.speechSafeAlarmStableFrames, 6);
  assert.equal(DSP_CONFIG.alarmDuckingReduction, 0.8);
  assert.equal(DSP_CONFIG.alarmDuckingReleaseMs, 180);
  const magnitudes = new Float64Array(DSP_CONFIG.fftSize / 2 + 1).fill(1);
  for (const frequency of [1219, 2625, 5813, 6844, 9891]) magnitudes[Math.round(frequency * DSP_CONFIG.fftSize / 48000)] = 40;
  const peaks = findTonalPeaks(magnitudes, 48000, { minimumFrequency: profile.minimumProtectedFrequency, sensitivity: profile.detectionSensitivity, preserveSpeech: true });
  assert.equal(peaks.length, 5);
});

test("detects the dominant and lower layers of the measured alarm", () => {
  const magnitudes = new Float64Array(DSP_CONFIG.fftSize / 2 + 1).fill(1);
  for (const frequency of [4125, 5953, 10359]) magnitudes[Math.round(frequency * DSP_CONFIG.fftSize / 48000)] = 40;
  const peaks = findTonalPeaks(magnitudes, 48000, {
    minimumFrequency: 1000,
    sensitivity: 95,
    preserveSpeech: true
  });
  assert.ok(peaks.some(peak => Math.abs(peak.frequency - 10359) < 60));
  assert.ok(peaks.some(peak => Math.abs(peak.frequency - 5953) < 60));
  assert.ok(peaks.some(peak => Math.abs(peak.frequency - 4125) < 60));
});

test("migrates the previous decibel setting to an equivalent percentage", () => {
  const profile = normalizeProfile({ schemaVersion: 3, detectorRevision: 2, protectionStrength: "strong", maximumTonalReduction: 60, suddenSoundLimit: 75 });
  assert.ok(profile.maximumTonalReductionPercent > 99.8);
  assert.equal(profile.suddenSoundReductionPercent, 50);
  assert.equal(Object.hasOwn(profile, "maximumTonalReduction"), false);
});
