const status = document.querySelector("#status");
const button = document.querySelector("#toggle");
const error = document.querySelector("#error");
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

async function render(enabled) {
  status.textContent = enabled ? "Shielding is active on this tab" : "This tab is playing normally";
  button.textContent = enabled ? "Stop protecting this tab" : "Protect this tab";
  button.classList.toggle("danger", enabled);
}

const initial = await chrome.runtime.sendMessage({ type: "status", tabId: tab.id });
render(initial.enabled);
button.addEventListener("click", async () => {
  button.disabled = true; error.textContent = "";
  const result = await chrome.runtime.sendMessage({ type: "toggle", tabId: tab.id });
  if (result.error) error.textContent = result.error;
  else await render(result.enabled);
  button.disabled = false;
});
