import { DEFAULT_PROFILE, normalizeProfile } from "./shared.js";

const sessions = new Map();
const IDLE_RELEASE_DELAY = 5000;

function buildGraph(session) {
  if (session.processor) return;
  const processor = new AudioWorkletNode(session.context, "sonic-shield-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: "max"
  });
  processor.port.postMessage({ type: "profile", profile: session.profile });
  session.source.connect(processor).connect(session.context.destination);
  session.processor = processor;
}

function destroyGraph(session) {
  if (!session.processor) return;
  session.source.disconnect();
  session.processor.disconnect();
  session.processor.port.close();
  session.processor = null;
}

async function setAudible(tabId, audible) {
  const session = sessions.get(tabId);
  if (!session) return;
  clearTimeout(session.idleTimer);
  session.idleTimer = null;
  if (audible) {
    buildGraph(session);
    if (session.context.state === "suspended") await session.context.resume();
    return;
  }
  session.idleTimer = setTimeout(async () => {
    session.idleTimer = null;
    if (!sessions.has(tabId) || session.context.state === "closed") return;
    await session.context.suspend();
    destroyGraph(session);
  }, IDLE_RELEASE_DELAY);
}

async function start(tabId, streamId, storedProfile, audible) {
  if (sessions.has(tabId)) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } }, video: false });
  const context = new AudioContext({ latencyHint: "interactive" });
  await context.audioWorklet.addModule(chrome.runtime.getURL("src/shield-processor.js"));
  const session = {
    context,
    stream,
    source: context.createMediaStreamSource(stream),
    profile: normalizeProfile(storedProfile || DEFAULT_PROFILE),
    processor: null,
    idleTimer: null
  };
  sessions.set(tabId, session);
  if (audible) buildGraph(session);
  else await context.suspend();
}

async function stop(tabId) {
  const session = sessions.get(tabId);
  if (!session) return;
  sessions.delete(tabId);
  clearTimeout(session.idleTimer);
  if (session.processor && session.context.state === "running") {
    session.processor.port.postMessage({ type: "bypass" });
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  session.stream.getTracks().forEach(track => track.stop());
  destroyGraph(session);
  session.source.disconnect();
  if (session.context.state !== "closed") await session.context.close();
}

function updateProfile(storedProfile) {
  const profile = normalizeProfile(storedProfile || DEFAULT_PROFILE);
  for (const session of sessions.values()) {
    session.profile = profile;
    session.processor?.port.postMessage({ type: "profile", profile });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "audio-status") {
    const session = sessions.get(message.tabId);
    sendResponse({ enabled: Boolean(session), idle: session?.processor === null });
    return;
  }
  if (message.type === "update-profile") {
    updateProfile(message.profile);
    sendResponse({ ok: true });
    return;
  }
  if (message.type === "set-audible") setAudible(message.tabId, message.audible).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ error: error.message }));
  if (message.type === "start") start(message.tabId, message.streamId, message.profile, message.audible).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ error: error.message }));
  if (message.type === "stop") stop(message.tabId).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ error: error.message }));
  return message.type === "set-audible" || message.type === "start" || message.type === "stop";
});
