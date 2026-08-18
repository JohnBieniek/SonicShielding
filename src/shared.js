export const PROFILE_SCHEMA_VERSION = 6;
export const DETECTOR_REVISION = 4;
export const COMFORT_EQ_REVISION = 1;
export const SUDDEN_SOUND_REVISION = 1;
export const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 12000];
export const BAND_RANGES = [
  [45, 90], [90, 180], [180, 355], [355, 710], [710, 1400],
  [1400, 2800], [2800, 5700], [5700, 9800], [9800, 16000]
];
export const PROTECTION_PRESETS = {
  low: { detectionSensitivity: 35, maximumTonalReductionPercent: 88 },
  balanced: { detectionSensitivity: 50, maximumTonalReductionPercent: 94 },
  strong: { detectionSensitivity: 95, maximumTonalReductionPercent: 99 }
};
export const DEFAULT_PROFILE = {
  schemaVersion: PROFILE_SCHEMA_VERSION,
  detectorRevision: DETECTOR_REVISION,
  comfortEqRevision: COMFORT_EQ_REVISION,
  suddenSoundRevision: SUDDEN_SOUND_REVISION,
  protectionStrength: "strong",
  aggressiveAlarmBlocking: false,
  preserveSpeech: true,
  suddenSoundReductionPercent: 50,
  detectionSensitivity: 95,
  maximumTonalReductionPercent: 99,
  minimumProtectedFrequency: 1000,
  releaseDuration: 110,
  comfortEqEnabled: false,
  comfortEqReductions: [0, 0, 0, 0, 97, 98, 99, 100, 100]
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
  const legacyStaticProfile = !profile.schemaVersion || profile.schemaVersion < 2;
  const legacyDetector = profile.detectorRevision !== DETECTOR_REVISION;
  const legacyReductions = profile.thresholds || [];
  const legacyReduction = value => clamp(Number(value) < 0 ? Math.abs(Number(value)) : value, 0, 100, 0);
  const migratedTonalReduction = profile.detectorRevision === 2
    ? (1 - Math.pow(10, -clamp(profile.maximumTonalReduction, 0, 72, 60) / 20)) * 100
    : profile.maximumTonalReductionPercent;
  const protectionStrength = !legacyDetector && Object.hasOwn(PROTECTION_PRESETS, profile.protectionStrength) ? profile.protectionStrength : DEFAULT_PROFILE.protectionStrength;
  const preset = PROTECTION_PRESETS[protectionStrength];
  const migratedSuddenReduction = profile.suddenSoundReductionPercent ??
    (profile.peakLevelCeiling !== undefined ? 100 - profile.peakLevelCeiling : undefined) ??
    (profile.suddenSoundLimit !== undefined ? 100 - profile.suddenSoundLimit : undefined) ??
    (profile.cap !== undefined ? 100 - profile.cap : undefined);
  const keepExistingEq = profile.comfortEqRevision === COMFORT_EQ_REVISION || profile.comfortEqEnabled === true;
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    detectorRevision: DETECTOR_REVISION,
    comfortEqRevision: COMFORT_EQ_REVISION,
    suddenSoundRevision: SUDDEN_SOUND_REVISION,
    protectionStrength,
    aggressiveAlarmBlocking: Boolean(profile.aggressiveAlarmBlocking),
    preserveSpeech: profile.preserveSpeech ?? true,
    suddenSoundReductionPercent: clamp(
      profile.suddenSoundRevision === SUDDEN_SOUND_REVISION ? migratedSuddenReduction : DEFAULT_PROFILE.suddenSoundReductionPercent,
      0,
      90,
      DEFAULT_PROFILE.suddenSoundReductionPercent
    ),
    detectionSensitivity: clamp(legacyDetector ? preset.detectionSensitivity : profile.detectionSensitivity, 0, 100, preset.detectionSensitivity),
    maximumTonalReductionPercent: clamp(migratedTonalReduction, 0, 100, preset.maximumTonalReductionPercent),
    minimumProtectedFrequency: clamp(legacyDetector ? DEFAULT_PROFILE.minimumProtectedFrequency : profile.minimumProtectedFrequency, 1000, 5000, DEFAULT_PROFILE.minimumProtectedFrequency),
    releaseDuration: clamp(legacyDetector ? DEFAULT_PROFILE.releaseDuration : profile.releaseDuration, 40, 250, DEFAULT_PROFILE.releaseDuration),
    comfortEqEnabled: legacyStaticProfile ? false : Boolean(profile.comfortEqEnabled),
    comfortEqReductions: BANDS.map((_, index) => keepExistingEq
      ? legacyReduction(profile.comfortEqReductions?.[index] ?? legacyReductions[index])
      : DEFAULT_PROFILE.comfortEqReductions[index])
  };
}

export function formatFrequency(hz) {
  return hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
}

export function formatFrequencyRange([low, high]) {
  return `${formatFrequency(low)}–${formatFrequency(high)}`;
}
