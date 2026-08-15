import { BANDS, DEFAULT_PROFILE, profileToGains } from "./shared.js";

const sessions = new Map();

async function getProfile() {
  const { profile = DEFAULT_PROFILE } = await chrome.storage.local.get("profile");
  return profile;
}

async function start(tabId, streamId) {
  if (sessions.has(tabId)) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } }, video: false });
  const context = new AudioContext({ latencyHint: "interactive" });
  const source = context.createMediaStreamSource(stream);
  const profile = await getProfile();
  let node = source;

  // Parallel peaking filters approximate a personalized comfort curve without recording audio.
  for (const [index, frequency] of BANDS.entries()) {
    const filter = context.createBiquadFilter();
    filter.type = "peaking";
    filter.frequency.value = frequency;
    filter.Q.value = 1.25;
    filter.gain.value = profileToGains(profile)[index];
    node.connect(filter);
    node = filter;
  }

  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.knee.value = 8;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.18;
  const output = context.createGain();
  output.gain.value = Math.pow(10, (profile.output ?? -3) / 20);
  node.connect(limiter).connect(output).connect(context.destination);
  sessions.set(tabId, { context, stream });
}

async function stop(tabId) {
  const session = sessions.get(tabId);
  if (!session) return;
  session.stream.getTracks().forEach(track => track.stop());
  await session.context.close();
  sessions.delete(tabId);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "start") start(message.tabId, message.streamId).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ error: error.message }));
  if (message.type === "stop") stop(message.tabId).then(() => sendResponse({ ok: true }));
  return message.type === "start" || message.type === "stop";
});
