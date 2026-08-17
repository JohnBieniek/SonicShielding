# Sonic Shielding

Sonic Shielding is a Chrome and Brave extension that softens sudden and frequency-sensitive audio in browser tabs selected by the user. Audio is processed locally and is never recorded or uploaded.

## Current capabilities

- Protect multiple selected tabs and keep protection active while switching tabs.
- Detect prominent narrow beeps and harsh tones locally, then apply short-lived notches only where needed.
- Limit sudden broadband peaks with a separate peak-level ceiling expressed as a percentage of digital maximum.
- Preserve speech by default, with an optional permanent nine-band comfort EQ in its own section.
- Store the comfort profile locally.
- Suspend and release processing resources when a protected tab is silent.

Browser security requires the user to enable each protected tab. Extensions cannot intercept operating-system sounds or desktop applications.

## Load locally

1. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this repository folder.
4. Open a tab that plays audio and select **Protect this tab** from the toolbar popup.

Chrome and Brave internal pages, along with extension-store pages, cannot be captured.

## Verify and package

```powershell
npm test
npm run package
```

The packaged store upload is written to `dist/`. Before publishing, add final store screenshots, a support contact, and a publicly hosted copy of `PRIVACY.md`.

## Safety and scope

Sonic Shielding is a comfort tool, not a medical device, hearing test, or guarantee that migraine symptoms will be prevented. Digital volume is not a calibrated sound-pressure measurement and varies by output device and system volume.
