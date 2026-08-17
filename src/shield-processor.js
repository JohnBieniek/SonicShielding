import { DSP_CONFIG, findTonalPeaks } from "./dsp-config.js";

const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 12000];

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}

function biquadCoefficients(type, frequency, q, gainDb = 0) {
  const omega = 2 * Math.PI * Math.min(frequency, sampleRate * 0.49) / sampleRate;
  const cosine = Math.cos(omega);
  const sine = Math.sin(omega);
  const amplitude = Math.pow(10, gainDb / 40);
  let alpha = sine / (2 * q);
  let b0; let b1; let b2; let a0; let a1; let a2;
  if (type === "notch") {
    b0 = 1; b1 = -2 * cosine; b2 = 1;
    a0 = 1 + alpha; a1 = -2 * cosine; a2 = 1 - alpha;
  } else {
    alpha *= amplitude;
    b0 = 1 + alpha * amplitude; b1 = -2 * cosine; b2 = 1 - alpha * amplitude;
    a0 = 1 + alpha / amplitude; a1 = -2 * cosine; a2 = 1 - alpha / amplitude;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

function fftMagnitudes(samples) {
  const size = samples.length;
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let index = 0; index < size; index += 1) real[index] = samples[index] * (0.5 - 0.5 * Math.cos(2 * Math.PI * index / (size - 1)));
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = -2 * Math.PI / length;
    for (let start = 0; start < size; start += length) {
      for (let offset = 0; offset < length / 2; offset += 1) {
        const phase = angle * offset;
        const cosine = Math.cos(phase);
        const sine = Math.sin(phase);
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal = real[odd] * cosine - imaginary[odd] * sine;
        const oddImaginary = real[odd] * sine + imaginary[odd] * cosine;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
      }
    }
  }
  const magnitudes = new Float64Array(size / 2 + 1);
  for (let index = 0; index < magnitudes.length; index += 1) magnitudes[index] = Math.hypot(real[index], imaginary[index]);
  return magnitudes;
}

class SonicShieldProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.profile = {};
    this.analysis = new Float32Array(DSP_CONFIG.fftSize);
    this.analysisWrite = 0;
    this.samplesUntilAnalysis = DSP_CONFIG.analysisHop;
    this.delayLength = Math.ceil(sampleRate * DSP_CONFIG.lookaheadMs / 1000);
    this.delay = [new Float32Array(this.delayLength), new Float32Array(this.delayLength)];
    this.delayWrite = 0;
    this.candidates = new Map();
    this.notches = [];
    this.eq = [];
    this.limiterEnvelope = [0, 0];
    this.port.onmessage = event => {
      if (event.data.type === "bypass") this.setProfile({ preserveSpeech: true, suddenSoundReductionPercent: 0, detectionSensitivity: 0, maximumTonalReductionPercent: 0, minimumProtectedFrequency: 5000, releaseDuration: 40, comfortEqEnabled: false, comfortEqReductions: [] });
      if (event.data.type === "profile") this.setProfile(event.data.profile || {});
    };
  }

  setProfile(profile) {
    this.profile = {
      preserveSpeech: profile.preserveSpeech ?? true,
      peakLevel: 1 - clamp(profile.suddenSoundReductionPercent, 0, 90, 50) / 100,
      detectionSensitivity: clamp(profile.detectionSensitivity, 0, 100, 95),
      maximumTonalReductionPercent: clamp(profile.maximumTonalReductionPercent, 0, 100, 99),
      minimumProtectedFrequency: clamp(profile.minimumProtectedFrequency, 1000, 5000, 1000),
      releaseDuration: clamp(profile.releaseDuration, 40, 250, 110),
      comfortEqEnabled: Boolean(profile.comfortEqEnabled),
      comfortEqReductions: BANDS.map((_, index) => clamp(profile.comfortEqReductions?.[index], 0, 100, 0))
    };
    this.eq = BANDS.map((frequency, index) => ({
      coefficients: biquadCoefficients("peaking", frequency, 1.2, 20 * Math.log10(Math.max(0.001, 1 - this.profile.comfortEqReductions[index] / 100))),
      states: [new Float64Array(2), new Float64Array(2)]
    }));
  }

  filter(sample, coefficients, state) {
    const output = coefficients[0] * sample + state[0];
    state[0] = coefficients[1] * sample - coefficients[3] * output + state[1];
    state[1] = coefficients[2] * sample - coefficients[4] * output;
    return output;
  }

  analyze() {
    const ordered = new Float32Array(DSP_CONFIG.fftSize);
    let energy = 0;
    for (let index = 0; index < ordered.length; index += 1) {
      const value = this.analysis[(this.analysisWrite + index) % ordered.length];
      ordered[index] = value;
      energy += value * value;
    }
    if (Math.sqrt(energy / ordered.length) < DSP_CONFIG.minimumRms) {
      this.notches.forEach(notch => { notch.target = 0; });
      return;
    }
    const peaks = findTonalPeaks(fftMagnitudes(ordered), sampleRate, {
      minimumFrequency: this.profile.minimumProtectedFrequency,
      sensitivity: this.profile.detectionSensitivity,
      preserveSpeech: this.profile.preserveSpeech
    });
    const seen = new Set();
    for (const peak of peaks) {
      const key = Math.round(peak.frequency / 80);
      const count = (this.candidates.get(key) || 0) + 1;
      this.candidates.set(key, count);
      seen.add(key);
      // A very prominent attack can arm immediately; less obvious tones still
      // require stability so speech harmonics do not create transient notches.
      if (count < DSP_CONFIG.consecutiveFrames && peak.prominenceDb < DSP_CONFIG.immediateProminenceDb) continue;
      let notch = this.notches.find(item => Math.abs(item.frequency - peak.frequency) < 120);
      if (!notch && this.notches.length < DSP_CONFIG.maximumNotches) {
        notch = { frequency: peak.frequency, depth: 0, target: 1, coefficients: null, states: [new Float64Array(2), new Float64Array(2)] };
        this.notches.push(notch);
      }
      if (notch) {
        notch.frequency = peak.frequency;
        notch.coefficients = biquadCoefficients("notch", peak.frequency, DSP_CONFIG.notchQ);
        notch.target = this.profile.maximumTonalReductionPercent / 100;
      }
    }
    for (const key of [...this.candidates.keys()]) {
      if (!seen.has(key)) this.candidates.delete(key);
    }
    this.notches.forEach(notch => {
      if (![...seen].some(key => Math.abs(key * 80 - notch.frequency) < 160)) notch.target = 0;
    });
  }

  processSample(sample, channel) {
    let output = sample;
    const attack = Math.exp(-1 / (DSP_CONFIG.attackMs * 0.001 * sampleRate));
    const release = Math.exp(-1 / (this.profile.releaseDuration * 0.001 * sampleRate));
    for (const notch of this.notches) {
      const coefficient = notch.target > notch.depth ? attack : release;
      notch.depth = coefficient * notch.depth + (1 - coefficient) * notch.target;
      if (notch.coefficients && notch.depth > 0.0001) {
        const filtered = this.filter(output, notch.coefficients, notch.states[channel]);
        output += (filtered - output) * notch.depth;
      }
    }
    if (this.profile.comfortEqEnabled) {
      for (const band of this.eq) output = this.filter(output, band.coefficients, band.states[channel]);
    }
    const magnitude = Math.abs(output);
    const envelopeCoefficient = magnitude > this.limiterEnvelope[channel] ? Math.exp(-1 / (0.001 * sampleRate)) : Math.exp(-1 / (0.08 * sampleRate));
    this.limiterEnvelope[channel] = envelopeCoefficient * this.limiterEnvelope[channel] + (1 - envelopeCoefficient) * magnitude;
    if (this.limiterEnvelope[channel] > this.profile.peakLevel) output *= this.profile.peakLevel / this.limiterEnvelope[channel];
    return output;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length || !output?.length) return true;
    for (let frame = 0; frame < output[0].length; frame += 1) {
      let mono = 0;
      for (let channel = 0; channel < input.length; channel += 1) mono += input[channel][frame] || 0;
      mono /= input.length;
      this.analysis[this.analysisWrite] = mono;
      this.analysisWrite = (this.analysisWrite + 1) % this.analysis.length;
      if (--this.samplesUntilAnalysis <= 0) {
        this.samplesUntilAnalysis = DSP_CONFIG.analysisHop;
        this.analyze();
      }
      for (let channel = 0; channel < output.length; channel += 1) {
        const delay = this.delay[channel];
        const delayed = delay[this.delayWrite];
        delay[this.delayWrite] = input[Math.min(channel, input.length - 1)]?.[frame] || 0;
        output[channel][frame] = this.processSample(delayed, channel);
      }
      this.delayWrite = (this.delayWrite + 1) % this.delayLength;
    }
    this.notches = this.notches.filter(notch => notch.target > 0 || notch.depth > 0.0001);
    return true;
  }
}

registerProcessor("sonic-shield-processor", SonicShieldProcessor);
