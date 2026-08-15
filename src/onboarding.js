document.getElementById("gotit").addEventListener("click", async () => {
  await chrome.storage.local.set({ onboarded: true });
  try { window.close(); } catch {}
});

// Allow closing via Escape
window.addEventListener("keydown", event => { if (event.key === "Escape") document.getElementById("gotit").click(); });
