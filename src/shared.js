export const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 12000];
export const BAND_RANGES = [
  [45, 90], [90, 180], [180, 355], [355, 710], [710, 1400],
  [1400, 2800], [2800, 5700], [5700, 9800], [9800, 16000]
];
export const DEFAULT_PROFILE = {
  name: "Gentle",
  thresholds: [0, 0, 0, 0, 97, 98, 99, 100, 100],
  output: 0,
  cap: 100
};

export function clampReduction(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

export function reductionToLinearGain(reduction) {
  return 1 - clampReduction(reduction) / 100;
}

export function reductionToDecibels(reduction) {
  const gain = reductionToLinearGain(reduction);
  return gain === 0 ? -100 : 20 * Math.log10(gain);
}

export function levelToDecibels(level) {
  const linear = clampReduction(level) / 100;
  return linear === 0 ? -100 : 20 * Math.log10(linear);
}

export function profileToGains(profile) {
  return BANDS.map((_, index) => reductionToDecibels(profile.thresholds[index] ?? 0));
}

export function reductionToFilterSettings(reduction) {
  const amount = clampReduction(reduction);
  // Each UI range uses several overlapping filters. Q=4 keeps their combined
  // stop band inside that range, and partial cuts scale Q as gain falls.
  const baseQ = 4;
  if (amount === 100) return { type: "notch", gain: 0, q: baseQ };
  const gain = reductionToDecibels(amount);
  const amplitude = Math.pow(10, gain / 40);
  return { type: "peaking", gain, q: Math.min(1000, baseQ / amplitude) };
}

export function frequenciesForRange([low, high]) {
  const ratio = high / low;
  return [0.1, 0.5, 0.9].map(position => low * Math.pow(ratio, position));
}

export function normalizeProfile(profile = DEFAULT_PROFILE) {
  // Older profiles stored negative slider numbers. Preserve the user's chosen
  // number as a reduction percentage rather than interpreting it as calibrated dB.
  const fromLegacyValue = value => clampReduction(value < 0 ? Math.abs(value) : value);
  return {
    ...profile,
    thresholds: BANDS.map((_, index) => fromLegacyValue(Number(profile.thresholds?.[index] ?? DEFAULT_PROFILE.thresholds[index]))),
    output: fromLegacyValue(Number(profile.output ?? DEFAULT_PROFILE.output)),
    cap: clampReduction(profile.cap ?? DEFAULT_PROFILE.cap)
  };
}

export function formatFrequency(hz) {
  return hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
}

export function formatFrequencyRange([low, high]) {
  return `${formatFrequency(low)}–${formatFrequency(high)}`;
}
