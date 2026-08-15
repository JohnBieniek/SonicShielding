import { BANDS, DEFAULT_PROFILE, formatFrequency } from "./shared.js";
const container = document.querySelector("#bands");
const output = document.querySelector("#output");
let selected = 3;
let audioContext;
let oscillator;
const { profile = DEFAULT_PROFILE } = await chrome.storage.local.get("profile");

BANDS.forEach((frequency, index) => {
  const row = document.createElement("div"); row.className = "row";
  row.innerHTML = `<label><input type="radio" name="frequency" ${index === selected ? "checked" : ""}> ${formatFrequency(frequency)}</label><input type="range" min="-30" max="0" step="1" value="${profile.thresholds[index]}"><output>${profile.thresholds[index]} dB</output>`;
  row.querySelector("input[type=radio]").addEventListener("change", () => selected = index);
  row.querySelector("input[type=range]").addEventListener("input", event => row.querySelector("output").textContent = `${event.target.value} dB`);
  container.append(row);
});
output.value = profile.output; document.querySelector("#outputValue").textContent = `${profile.output} dB`;
output.addEventListener("input", () => document.querySelector("#outputValue").textContent = `${output.value} dB`);

function stopTone() { if (oscillator) { oscillator.stop(); oscillator = null; } }
function startTone() {
  stopTone(); audioContext ??= new AudioContext();
  oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
  oscillator.frequency.value = BANDS[selected]; oscillator.type = "sine"; gain.gain.value = 0.025;
  oscillator.connect(gain).connect(audioContext.destination); oscillator.start();
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
