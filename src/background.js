const protectedTabs = new Set();

chrome.runtime.onInstalled.addListener(() => chrome.storage.local.set({ protectedTabs: [] }));

async function ensureOffscreen() {
  const url = chrome.runtime.getURL("src/offscreen.html");
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
  if (!contexts.length) {
    await chrome.offscreen.createDocument({ url: "src/offscreen.html", reasons: ["USER_MEDIA"], justification: "Process audio from user-selected tabs locally." });
  }
}

async function updateState(tabId, enabled) {
  enabled ? protectedTabs.add(tabId) : protectedTabs.delete(tabId);
  await chrome.storage.local.set({ protectedTabs: [...protectedTabs] });
  await chrome.action.setBadgeText({ tabId, text: enabled ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#18b7aa" });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "status") {
    sendResponse({ enabled: protectedTabs.has(message.tabId) });
    return;
  }
  if (message.type === "toggle") {
    (async () => {
      const tabId = message.tabId;
      if (protectedTabs.has(tabId)) {
        await ensureOffscreen();
        await chrome.runtime.sendMessage({ type: "stop", tabId });
        await updateState(tabId, false);
      } else {
        await ensureOffscreen();
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
        await chrome.runtime.sendMessage({ type: "start", tabId, streamId });
        await updateState(tabId, true);
      }
      sendResponse({ enabled: protectedTabs.has(tabId) });
    })().catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener(async tabId => {
  if (!protectedTabs.has(tabId)) return;
  try { await chrome.runtime.sendMessage({ type: "stop", tabId }); } catch {}
  await updateState(tabId, false);
});
