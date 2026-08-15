import { BANDS, DEFAULT_PROFILE, formatFrequency } from "./shared.js";
const container = document.querySelector("#bands");
const output = document.querySelector("#output");
let selected = 3;
let audioContext;
let oscillator;
let oscGain;
let profile = (await chrome.storage.local.get("profile")).profile || DEFAULT_PROFILE;

BANDS.forEach((frequency, index) => {
  const row = document.createElement("div"); row.className = "row";
  row.innerHTML = `<label><input type="radio" name="frequency" ${index === selected ? "checked" : ""}> ${formatFrequency(frequency)}</label><input type="range" min="-30" max="0" step="1" value="${profile.thresholds[index]}"><output>${profile.thresholds[index]} dB</output>`;
  const radio = row.querySelector("input[type=radio]");
  const range = row.querySelector("input[type=range]");
  radio.addEventListener("change", () => {
    selected = index;
    if (oscGain) updateToneGain();
  });
  range.addEventListener("input", event => {
    row.querySelector("output").textContent = `${event.target.value} dB`;
    profile.thresholds[index] = Number(event.target.value);
    if (oscGain) updateToneGain();
  });
  container.append(row);
});
output.value = profile.output; document.querySelector("#outputValue").textContent = `${profile.output} dB`;
output.addEventListener("input", () => {
  document.querySelector("#outputValue").textContent = `${output.value} dB`;
  profile.output = Number(output.value);
  if (oscGain) updateToneGain();
});

function stopTone() { if (oscillator) { oscillator.stop(); oscillator = null; } oscGain = null; }
function updateToneGain() {
  if (!oscGain) return;
  const bandAtten = Number(profile.thresholds[selected] ?? -10);
  const out = Number(profile.output ?? -10);
  const combinedDb = bandAtten + out;
  const linear = Math.pow(10, combinedDb / 20);
  oscGain.gain.value = linear;
}
function startTone() {
  stopTone(); audioContext ??= new AudioContext();
  oscillator = audioContext.createOscillator(); oscGain = audioContext.createGain();
  oscillator.frequency.value = BANDS[selected]; oscillator.type = "sine";
  updateToneGain();
  oscillator.connect(oscGain).connect(audioContext.destination); oscillator.start();
}
const play = document.querySelector("#play");
play.addEventListener("pointerdown", startTone); ["pointerup", "pointercancel", "pointerleave"].forEach(type => play.addEventListener(type, stopTone));
document.querySelector("#stop").addEventListener("click", stopTone);
window.addEventListener("keydown", event => { if (event.key === "Escape") stopTone(); });
document.querySelector("#save").addEventListener("click", async () => {
  const thresholds = [...container.querySelectorAll("input[type=range]")].map(input => Number(input.value));
  await chrome.storage.local.set({ profile: { name: "My comfort profile", thresholds, output: Number(output.value) } });
  document.querySelector("#saved").textContent = "Saved. New protection sessions will use this profile.";
});
