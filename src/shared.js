export const PROFILE_SCHEMA_VERSION = 2;
export const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 12000];
export const BAND_RANGES = [
  [45, 90], [90, 180], [180, 355], [355, 710], [710, 1400],
  [1400, 2800], [2800, 5700], [5700, 9800], [9800, 16000]
];
export const PROTECTION_PRESETS = {
  low: { detectionSensitivity: 35, maximumTonalReduction: 18 },
  balanced: { detectionSensitivity: 50, maximumTonalReduction: 24 },
  strong: { detectionSensitivity: 70, maximumTonalReduction: 30 }
};
export const DEFAULT_PROFILE = {
  schemaVersion: PROFILE_SCHEMA_VERSION,
  protectionStrength: "balanced",
  preserveSpeech: true,
  suddenSoundLimit: 85,
  detectionSensitivity: 50,
  maximumTonalReduction: 24,
  minimumProtectedFrequency: 1500,
  releaseDuration: 80,
  comfortEqEnabled: false,
  comfortEqReductions: BANDS.map(() => 0),
  outputReduction: 0
};

export function clamp(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}

export function reductionToLinearGain(reduction) {
  return 1 - clamp(reduction, 0, 100, 0) / 100;
}

export function levelToDecibels(level) {
  const linear = clamp(level, 0, 100, 100) / 100;
  return linear === 0 ? -100 : 20 * Math.log10(linear);
}

export function normalizeProfile(profile = {}) {
  const legacy = profile.schemaVersion !== PROFILE_SCHEMA_VERSION;
  const legacyReductions = profile.thresholds || [];
  const legacyReduction = value => clamp(Number(value) < 0 ? Math.abs(Number(value)) : value, 0, 100, 0);
  const protectionStrength = Object.hasOwn(PROTECTION_PRESETS, profile.protectionStrength) ? profile.protectionStrength : "balanced";
  const preset = PROTECTION_PRESETS[protectionStrength];
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    protectionStrength,
    preserveSpeech: profile.preserveSpeech ?? true,
    suddenSoundLimit: clamp(profile.suddenSoundLimit ?? profile.cap, 10, 100, DEFAULT_PROFILE.suddenSoundLimit),
    detectionSensitivity: clamp(profile.detectionSensitivity, 0, 100, preset.detectionSensitivity),
    maximumTonalReduction: clamp(profile.maximumTonalReduction, 6, 36, preset.maximumTonalReduction),
    minimumProtectedFrequency: clamp(profile.minimumProtectedFrequency, 1000, 5000, DEFAULT_PROFILE.minimumProtectedFrequency),
    releaseDuration: clamp(profile.releaseDuration, 40, 250, DEFAULT_PROFILE.releaseDuration),
    comfortEqEnabled: legacy ? false : Boolean(profile.comfortEqEnabled),
    comfortEqReductions: BANDS.map((_, index) => legacyReduction(profile.comfortEqReductions?.[index] ?? legacyReductions[index])),
    outputReduction: legacyReduction(profile.outputReduction ?? profile.output)
  };
}

export function formatFrequency(hz) {
  return hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
}

export function formatFrequencyRange([low, high]) {
  return `${formatFrequency(low)}–${formatFrequency(high)}`;
}
