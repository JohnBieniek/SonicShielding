import { BANDS, BAND_RANGES, DEFAULT_PROFILE, frequenciesForRange, levelToDecibels, normalizeProfile, reductionToFilterSettings, reductionToLinearGain } from "./shared.js";

const sessions = new Map();

async function start(tabId, streamId, storedProfile) {
  if (sessions.has(tabId)) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } }, video: false });
  const context = new AudioContext({ latencyHint: "interactive" });
  const source = context.createMediaStreamSource(stream);
  const profile = normalizeProfile(storedProfile || DEFAULT_PROFILE);
  let node = source;
  const filters = [];

  // Parallel peaking filters approximate a personalized comfort curve without recording audio.
  for (const [index] of BANDS.entries()) {
    const settings = reductionToFilterSettings(profile.thresholds[index]);
    const bandFilters = frequenciesForRange(BAND_RANGES[index]).map(frequency => {
      const filter = context.createBiquadFilter();
      filter.frequency.value = frequency;
      filter.type = settings.type;
      filter.Q.value = settings.q;
      filter.gain.value = settings.gain;
      node.connect(filter);
      node = filter;
      return filter;
    });
    filters.push(bandFilters);
  }

  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = levelToDecibels(profile.cap);
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;
  const output = context.createGain();
  output.gain.value = reductionToLinearGain(profile.output);
  node.connect(limiter).connect(output).connect(context.destination);
  sessions.set(tabId, { context, stream, source, filters, limiter, output });
}

async function stop(tabId) {
  const session = sessions.get(tabId);
  if (!session) return;
  sessions.delete(tabId);
  const { context, stream, source, filters, limiter, output } = session;

  // Return the captured signal to unity before Chrome switches back to native tab audio.
  // This avoids a muted or attenuated handoff when shielding is disabled.
  if (context.state !== "closed") {
    const now = context.currentTime;
    for (const bandFilters of filters) {
      for (const filter of bandFilters) {
        filter.type = "peaking";
        filter.gain.cancelScheduledValues(now);
        filter.gain.setValueAtTime(filter.gain.value, now);
        filter.gain.linearRampToValueAtTime(0, now + 0.04);
      }
    }
    output.gain.cancelScheduledValues(now);
    output.gain.setValueAtTime(output.gain.value, now);
    output.gain.linearRampToValueAtTime(1, now + 0.04);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  stream.getTracks().forEach(track => track.stop());
  source.disconnect();
  filters.flat().forEach(filter => filter.disconnect());
  limiter.disconnect();
  output.disconnect();
  if (context.state !== "closed") await context.close();
}

function updateProfile(storedProfile) {
  const profile = normalizeProfile(storedProfile || DEFAULT_PROFILE);
  for (const { context, filters, limiter, output } of sessions.values()) {
    if (context.state === "closed") continue;
    const now = context.currentTime;
    filters.forEach((bandFilters, index) => {
      const settings = reductionToFilterSettings(profile.thresholds[index]);
      bandFilters.forEach(filter => {
        filter.type = settings.type;
        filter.Q.cancelScheduledValues(now);
        filter.Q.setValueAtTime(filter.Q.value, now);
        filter.Q.linearRampToValueAtTime(settings.q, now + 0.04);
        filter.gain.cancelScheduledValues(now);
        filter.gain.setValueAtTime(filter.gain.value, now);
        filter.gain.linearRampToValueAtTime(settings.gain, now + 0.04);
      });
    });
    output.gain.cancelScheduledValues(now);
    output.gain.setValueAtTime(output.gain.value, now);
    output.gain.linearRampToValueAtTime(reductionToLinearGain(profile.output), now + 0.04);
    limiter.threshold.cancelScheduledValues(now);
    limiter.threshold.setValueAtTime(limiter.threshold.value, now);
    limiter.threshold.linearRampToValueAtTime(levelToDecibels(profile.cap), now + 0.04);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "audio-status") {
    sendResponse({ enabled: sessions.has(message.tabId) });
    return;
  }
  if (message.type === "update-profile") {
    updateProfile(message.profile);
    sendResponse({ ok: true });
    return;
  }
  if (message.type === "start") start(message.tabId, message.streamId, message.profile).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ error: error.message }));
  if (message.type === "stop") stop(message.tabId).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ error: error.message }));
  return message.type === "start" || message.type === "stop";
});
