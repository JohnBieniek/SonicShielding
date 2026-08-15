const protectedTabs = new Set();

chrome.runtime.onInstalled.addListener(async details => {
  await chrome.storage.local.set({ protectedTabs: [] });
  if (details.reason === "install") {
    const { onboarded } = await chrome.storage.local.get("onboarded");
    if (!onboarded) {
      chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding.html") });
    }
  }
});

async function hasOffscreen() {
  const url = chrome.runtime.getURL("src/offscreen.html");
  if (typeof chrome.runtime.getContexts === "function") {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
    return contexts.length > 0;
  }
  if (typeof chrome.offscreen?.hasDocument === "function") return chrome.offscreen.hasDocument();
  return false;
}

async function ensureOffscreen() {
  if (!await hasOffscreen()) {
    await chrome.offscreen.createDocument({ url: "src/offscreen.html", reasons: ["USER_MEDIA"], justification: "Process audio from user-selected tabs locally." });
  }
}

async function isAudioActive(tabId) {
  if (!await hasOffscreen()) return false;
  try {
    const result = await chrome.runtime.sendMessage({ type: "audio-status", tabId });
    return result?.enabled === true;
  } catch {
    return false;
  }
}

async function updateState(tabId, enabled) {
  enabled ? protectedTabs.add(tabId) : protectedTabs.delete(tabId);
  await chrome.storage.local.set({ protectedTabs: [...protectedTabs] });
  const iconName = enabled ? "icon" : "icon-inactive";
  await chrome.action.setIcon({
    tabId,
    path: {
      16: chrome.runtime.getURL(`icons/${iconName}-16.png`),
      32: chrome.runtime.getURL(`icons/${iconName}-32.png`),
      48: chrome.runtime.getURL(`icons/${iconName}-48.png`),
      128: chrome.runtime.getURL(`icons/${iconName}-128.png`)
    }
  });
  await chrome.action.setBadgeText({ tabId, text: "" });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "status") {
    (async () => {
      const enabled = await isAudioActive(message.tabId);
      await updateState(message.tabId, enabled);
      sendResponse({ enabled });
    })().catch(error => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === "toggle") {
    (async () => {
      const tabId = message.tabId;
      const enabled = await isAudioActive(tabId);
      if (enabled) {
        const result = await chrome.runtime.sendMessage({ type: "stop", tabId });
        if (result?.error) throw new Error(result.error);
        await updateState(tabId, false);
      } else {
        await ensureOffscreen();
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
        const { profile } = await chrome.storage.local.get("profile");
        const result = await chrome.runtime.sendMessage({ type: "start", tabId, streamId, profile });
        if (result?.error) throw new Error(result.error);
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

chrome.tabs.onCreated.addListener(tab => {
  if (tab.id !== undefined) updateState(tab.id, false).catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  isAudioActive(tabId)
    .then(enabled => updateState(tabId, enabled))
    .catch(() => updateState(tabId, false).catch(() => {}));
});

chrome.tabCapture.onStatusChanged.addListener(info => {
  if (info.status === "active") {
    updateState(info.tabId, true).catch(() => {});
  } else if (info.status === "stopped" || info.status === "error") {
    updateState(info.tabId, false).catch(() => {});
  }
});
