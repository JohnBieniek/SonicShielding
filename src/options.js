import { BANDS, BAND_RANGES, DEFAULT_PROFILE, formatFrequencyRange, normalizeProfile, reductionToLinearGain } from "./shared.js";
const container = document.querySelector("#bands");
const output = document.querySelector("#output");
const cap = document.querySelector("#cap");
const autosave = document.querySelector("#autosave");
const saveButton = document.querySelector("#save");
const savedMessage = document.querySelector("#saved");
let selected = 3;
let audioContext;
let oscillator;
let oscGain;
let toneRequest = 0;
let saveTimer;
const stored = await chrome.storage.local.get(["profile", "autoSave"]);
let profile = normalizeProfile(stored.profile || DEFAULT_PROFILE);
autosave.checked = stored.autoSave ?? true;
saveButton.hidden = autosave.checked;

function currentProfile() {
  return {
    name: "My comfort profile",
    thresholds: [...container.querySelectorAll("input[type=range]")].map(input => Number(input.value)),
    output: Number(output.value),
    cap: Number(cap.value)
  };
}

async function saveProfile(message) {
  profile = currentProfile();
  await chrome.storage.local.set({ profile });
  await chrome.runtime.sendMessage({ type: "update-profile", profile });
  savedMessage.textContent = message;
}

function scheduleAutosave() {
  if (!autosave.checked) return;
  clearTimeout(saveTimer);
  savedMessage.textContent = "Saving…";
  saveTimer = setTimeout(() => {
    saveProfile("Autosaved. Active protection has been updated.")
      .catch(error => { savedMessage.textContent = `Could not autosave: ${error.message}`; });
  }, 120);
}

BANDS.forEach((frequency, index) => {
  const row = document.createElement("div"); row.className = "row";
  row.innerHTML = `<label><input type="radio" name="frequency" ${index === selected ? "checked" : ""}> ${formatFrequencyRange(BAND_RANGES[index])}</label><input type="range" min="0" max="100" step="1" value="${profile.thresholds[index]}"><output>${profile.thresholds[index]}% reduced</output>`;
  const radio = row.querySelector("input[type=radio]");
  const range = row.querySelector("input[type=range]");
  radio.addEventListener("change", () => {
    selected = index;
    if (oscGain) updateToneGain();
  });
  range.addEventListener("input", event => {
    row.querySelector("output").textContent = `${event.target.value}% reduced`;
    profile.thresholds[index] = Number(event.target.value);
    if (oscGain) updateToneGain();
    scheduleAutosave();
  });
  container.append(row);
});
output.value = profile.output; document.querySelector("#outputValue").textContent = `${profile.output}% reduced`;
output.addEventListener("input", () => {
  document.querySelector("#outputValue").textContent = `${output.value}% reduced`;
  profile.output = Number(output.value);
  if (oscGain) updateToneGain();
  scheduleAutosave();
});
cap.value = profile.cap; document.querySelector("#capValue").textContent = `${profile.cap}% maximum`;
cap.addEventListener("input", () => {
  document.querySelector("#capValue").textContent = `${cap.value}% maximum`;
  profile.cap = Number(cap.value);
  if (oscGain) updateToneGain();
  scheduleAutosave();
});

autosave.addEventListener("change", async () => {
  clearTimeout(saveTimer);
  saveButton.hidden = autosave.checked;
  await chrome.storage.local.set({ autoSave: autosave.checked });
  if (autosave.checked) {
    await saveProfile("Autosave enabled. Active protection has been updated.");
  } else {
    savedMessage.textContent = "Autosave is off. Use Save comfort profile to apply changes.";
  }
});

function stopTone() { toneRequest++; if (oscillator) { oscillator.stop(); oscillator = null; } oscGain = null; }
function updateToneGain() {
  if (!oscGain) return;
  const bandGain = reductionToLinearGain(profile.thresholds[selected]);
  const outputGain = reductionToLinearGain(profile.output);
  const capGain = Number(profile.cap) / 100;
  oscGain.gain.value = Math.min(bandGain * outputGain, capGain);
}
async function startTone() {
  stopTone(); audioContext ??= new AudioContext();
  const request = toneRequest;
  if (audioContext.state === "suspended") await audioContext.resume();
  if (request !== toneRequest) return;
  oscillator = audioContext.createOscillator(); oscGain = audioContext.createGain();
  const frequency = BANDS[selected];
  oscillator.frequency.value = frequency;
  // Small speakers often cannot reproduce a pure 63 or 125 Hz sine wave.
  // A triangle wave adds quiet harmonics that make those low test bands detectable.
  oscillator.type = frequency <= 125 ? "triangle" : "sine";
  updateToneGain();
  oscillator.connect(oscGain).connect(audioContext.destination); oscillator.start();
}
const play = document.querySelector("#play");
play.addEventListener("pointerdown", event => {
  event.preventDefault();
  play.setPointerCapture(event.pointerId);
  startTone().catch(stopTone);
});
["pointerup", "pointercancel", "lostpointercapture"].forEach(type => play.addEventListener(type, stopTone));
window.addEventListener("keydown", event => { if (event.key === "Escape") stopTone(); });
saveButton.addEventListener("click", () => {
  saveProfile("Saved. Active protection has been updated.")
    .catch(error => { savedMessage.textContent = `Could not save: ${error.message}`; });
});
