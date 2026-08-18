export const DSP_CONFIG = Object.freeze({
  fftSize: 1024,
  analysisHop: 256,
  maximumNotches: 6,
  // Common electronic alarms can place their strongest component just above
  // 10 kHz. Analyze through the upper comfort-EQ boundary so those tones are
  // eligible for temporary suppression too.
  maximumFrequency: 16000,
  baseProminenceDb: 12,
  consecutiveFrames: 2,
  immediateProminenceDb: 18,
  lookaheadMs: 40,
  attackMs: 4,
  defaultReleaseMs: 110,
  minimumRms: 0.006,
  notchQ: 8,
  aggressiveImmediateProminenceDb: 16,
  aggressiveAttackMs: 2,
  aggressiveNotchQ: 4.5,
  alarmDuckingMinimumPeaks: 2,
  speechSafeAlarmMinimumPeaks: 3,
  speechSafeAlarmHighFrequency: 5000,
  speechSafeAlarmMinimumHighPeaks: 2,
  speechSafeAlarmVeryHighFrequency: 9000,
  speechSafeAlarmStableFrames: 6,
  alarmDuckingReduction: 0.8,
  alarmDuckingReleaseMs: 180
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

export function isAlarmSignature(peaks, preserveSpeech = true) {
  if (!preserveSpeech) return peaks.length >= DSP_CONFIG.alarmDuckingMinimumPeaks;
  const stablePeaks = peaks.filter(peak => peak.frames >= DSP_CONFIG.speechSafeAlarmStableFrames);
  const highFrequencyPeaks = stablePeaks.filter(peak => peak.frequency >= DSP_CONFIG.speechSafeAlarmHighFrequency).length;
  const hasVeryHighFrequencyPeak = stablePeaks.some(peak => peak.frequency >= DSP_CONFIG.speechSafeAlarmVeryHighFrequency);
  return stablePeaks.length >= DSP_CONFIG.speechSafeAlarmMinimumPeaks &&
    highFrequencyPeaks >= DSP_CONFIG.speechSafeAlarmMinimumHighPeaks &&
    hasVeryHighFrequencyPeak;
}
