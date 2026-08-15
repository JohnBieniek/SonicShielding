export const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 12000];
export const DEFAULT_PROFILE = {
  name: "Gentle",
  thresholds: [-8, -8, -9, -10, -11, -12, -14, -16, -17],
  output: -10
};

export function profileToGains(profile) {
  return BANDS.map((_, index) => Math.min(0, Math.max(-30, Number(profile.thresholds[index] ?? -10))));
}

export function formatFrequency(hz) {
  return hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
}
