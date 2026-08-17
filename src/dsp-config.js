export const DSP_CONFIG = Object.freeze({
  fftSize: 1024,
  analysisHop: 256,
  maximumNotches: 6,
  maximumFrequency: 10000,
  baseProminenceDb: 12,
  consecutiveFrames: 2,
  immediateProminenceDb: 18,
  lookaheadMs: 40,
  attackMs: 4,
  defaultReleaseMs: 110,
  minimumRms: 0.006,
  notchQ: 8
});

export function findTonalPeaks(magnitudes, sampleRate, settings = {}) {
  const fftSize = (magnitudes.length - 1) * 2;
  const minimumFrequency = settings.minimumFrequency ?? 1500;
  const maximumFrequency = Math.min(settings.maximumFrequency ?? DSP_CONFIG.maximumFrequency, sampleRate / 2);
  const sensitivity = settings.sensitivity ?? 50;
  const preserveSpeech = settings.preserveSpeech ?? true;
  const prominenceRequired = DSP_CONFIG.baseProminenceDb + (50 - sensitivity) * 0.08 + (preserveSpeech ? 2 : 0);
  const minimumBin = Math.ceil(minimumFrequency * fftSize / sampleRate);
  const maximumBin = Math.min(magnitudes.length - 2, Math.floor(maximumFrequency * fftSize / sampleRate));
  const peaks = [];

  for (let bin = minimumBin; bin <= maximumBin; bin += 1) {
    const magnitude = magnitudes[bin];
    if (magnitude <= magnitudes[bin - 1] || magnitude < magnitudes[bin + 1]) continue;
    let neighborhood = 0;
    let samples = 0;
    for (let offset = -8; offset <= 8; offset += 1) {
      if (Math.abs(offset) <= 1 || bin + offset < 0 || bin + offset >= magnitudes.length) continue;
      neighborhood += magnitudes[bin + offset];
      samples += 1;
    }
    const baseline = Math.max(neighborhood / samples, 1e-12);
    const prominenceDb = 20 * Math.log10(Math.max(magnitude, 1e-12) / baseline);
    if (prominenceDb >= prominenceRequired) peaks.push({ frequency: bin * sampleRate / fftSize, prominenceDb, magnitude });
  }
  return peaks.sort((left, right) => right.prominenceDb - left.prominenceDb).slice(0, DSP_CONFIG.maximumNotches);
}
