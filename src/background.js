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

function setTabIcon(tabId, path) {
  return new Promise(resolve => {
    chrome.action.setIcon({ tabId, path }, () => {
      // A tab can close between an event and this callback. Reading lastError
      // prevents Brave from reporting that expected race as an unchecked error.
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function clearTabBadge(tabId) {
  return new Promise(resolve => {
    chrome.action.setBadgeText({ tabId, text: "" }, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

async function persistProtectedTabs() {
  await chrome.storage.local.set({ protectedTabs: [...protectedTabs] });
}

async function updateState(tabId, enabled) {
  enabled ? protectedTabs.add(tabId) : protectedTabs.delete(tabId);
  await persistProtectedTabs();
  const iconName = enabled ? "icon" : "icon-inactive";
  await setTabIcon(tabId, {
    16: chrome.runtime.getURL(`icons/${iconName}-16.png`),
    32: chrome.runtime.getURL(`icons/${iconName}-32.png`),
    48: chrome.runtime.getURL(`icons/${iconName}-48.png`),
    128: chrome.runtime.getURL(`icons/${iconName}-128.png`)
  });
  await clearTabBadge(tabId);
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
        const tab = await chrome.tabs.get(tabId);
        const result = await chrome.runtime.sendMessage({ type: "start", tabId, streamId, profile, audible: tab.audible === true });
        if (result?.error) throw new Error(result.error);
        await updateState(tabId, true);
      }
      sendResponse({ enabled: protectedTabs.has(tabId) });
    })().catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  (async () => {
    if (!protectedTabs.has(tabId)) return;
    try { await chrome.runtime.sendMessage({ type: "stop", tabId }); } catch {}
    protectedTabs.delete(tabId);
    await persistProtectedTabs();
  })().catch(() => {});
});

chrome.tabs.onCreated.addListener(tab => {
  if (tab.id !== undefined) updateState(tab.id, false).catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  isAudioActive(tabId)
    .then(enabled => updateState(tabId, enabled))
    .catch(() => updateState(tabId, false).catch(() => {}));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (typeof changeInfo.audible !== "boolean") return;
  isAudioActive(tabId).then(enabled => {
    if (!enabled) return;
    return chrome.runtime.sendMessage({ type: "set-audible", tabId, audible: changeInfo.audible });
  }).catch(() => {});
});

chrome.tabCapture.onStatusChanged.addListener(info => {
  if (info.status === "active") {
    updateState(info.tabId, true).catch(() => {});
  } else if (info.status === "stopped" || info.status === "error") {
    updateState(info.tabId, false).catch(() => {});
  }
});
