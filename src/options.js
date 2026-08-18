import { BAND_RANGES, DEFAULT_PROFILE, PROTECTION_PRESETS, formatFrequencyRange, normalizeProfile } from "./shared.js";

const byId = id => document.querySelector(`#${id}`);
const bands = byId("bands");
const autosave = byId("autosave");
const saveButton = byId("save");
const saved = byId("saved");
let saveTimer;
const stored = await chrome.storage.local.get(["profile", "autoSave"]);
let profile = normalizeProfile(stored.profile || DEFAULT_PROFILE);
autosave.checked = stored.autoSave ?? true;
saveButton.hidden = autosave.checked;

const controls = {
  strength: byId("strength"), suddenSoundReductionPercent: byId("suddenSoundReduction"), preserveSpeech: byId("preserveSpeech"),
  aggressiveAlarmBlocking: byId("aggressiveAlarmBlocking"),
  detectionSensitivity: byId("sensitivity"), maximumTonalReductionPercent: byId("tonalReduction"),
  minimumProtectedFrequency: byId("minimumFrequency"), releaseDuration: byId("releaseDuration"),
  comfortEqEnabled: byId("comfortEqEnabled")
};

function renderValues() {
  byId("suddenSoundReductionValue").textContent = `${controls.suddenSoundReductionPercent.value}% reduced`;
  byId("sensitivityValue").textContent = `${controls.detectionSensitivity.value}%`;
  byId("tonalReductionValue").textContent = `${controls.maximumTonalReductionPercent.value}% reduced`;
  byId("minimumFrequencyValue").textContent = `${Number(controls.minimumProtectedFrequency.value) / 1000} kHz`;
  byId("releaseDurationValue").textContent = `${controls.releaseDuration.value} ms after detection`;
}

function renderProfile() {
  controls.strength.value = profile.protectionStrength;
  controls.suddenSoundReductionPercent.value = profile.suddenSoundReductionPercent;
  controls.preserveSpeech.checked = profile.preserveSpeech;
  controls.aggressiveAlarmBlocking.checked = profile.aggressiveAlarmBlocking;
  controls.detectionSensitivity.value = profile.detectionSensitivity;
  controls.maximumTonalReductionPercent.value = profile.maximumTonalReductionPercent;
  controls.minimumProtectedFrequency.value = profile.minimumProtectedFrequency;
  controls.releaseDuration.value = profile.releaseDuration;
  controls.comfortEqEnabled.checked = profile.comfortEqEnabled;
  [...bands.querySelectorAll("input")].forEach((input, index) => { input.value = profile.comfortEqReductions[index]; input.nextElementSibling.textContent = `${input.value}% reduced`; });
  renderValues();
}

function currentProfile() {
  return normalizeProfile({
    schemaVersion: 6,
    detectorRevision: 4,
    comfortEqRevision: 1,
    suddenSoundRevision: 1,
    protectionStrength: controls.strength.value,
    suddenSoundReductionPercent: controls.suddenSoundReductionPercent.value,
    preserveSpeech: controls.preserveSpeech.checked,
    aggressiveAlarmBlocking: controls.aggressiveAlarmBlocking.checked,
    detectionSensitivity: controls.detectionSensitivity.value,
    maximumTonalReductionPercent: controls.maximumTonalReductionPercent.value,
    minimumProtectedFrequency: controls.minimumProtectedFrequency.value,
    releaseDuration: controls.releaseDuration.value,
    comfortEqEnabled: controls.comfortEqEnabled.checked,
    comfortEqReductions: [...bands.querySelectorAll("input")].map(input => input.value)
  });
}

async function saveProfile(message) {
  profile = currentProfile();
  await chrome.storage.local.set({ profile });
  await chrome.runtime.sendMessage({ type: "update-profile", profile });
  saved.textContent = message;
}

function scheduleAutosave() {
  renderValues();
  if (!autosave.checked) return;
  clearTimeout(saveTimer);
  saved.textContent = "Saving…";
  saveTimer = setTimeout(() => saveProfile("Autosaved. Active protection has been updated.").catch(error => { saved.textContent = error.message; }), 120);
}

BAND_RANGES.forEach((range, index) => {
  const row = document.createElement("label");
  row.className = "row";
  row.innerHTML = `<span>${formatFrequencyRange(range)}</span><input type="range" min="0" max="100" value="${profile.comfortEqReductions[index]}"><output>${profile.comfortEqReductions[index]}% reduced</output>`;
  row.querySelector("input").addEventListener("input", event => { event.target.nextElementSibling.textContent = `${event.target.value}% reduced`; scheduleAutosave(); });
  bands.append(row);
});

Object.values(controls).forEach(control => control.addEventListener("input", scheduleAutosave));
controls.strength.addEventListener("change", () => {
  const preset = PROTECTION_PRESETS[controls.strength.value];
  controls.detectionSensitivity.value = preset.detectionSensitivity;
  controls.maximumTonalReductionPercent.value = preset.maximumTonalReductionPercent;
  scheduleAutosave();
});
autosave.addEventListener("change", async () => {
  clearTimeout(saveTimer);
  saveButton.hidden = autosave.checked;
  await chrome.storage.local.set({ autoSave: autosave.checked });
  if (autosave.checked) await saveProfile("Autosave enabled. Active protection has been updated.");
  else saved.textContent = "Autosave is off. Save to apply changes.";
});
saveButton.addEventListener("click", () => saveProfile("Saved. Active protection has been updated.").catch(error => { saved.textContent = error.message; }));
renderProfile();
