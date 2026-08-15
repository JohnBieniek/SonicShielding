# SonicShielding

SonicShielding is a Chrome and Brave extension that softens sudden and frequency-sensitive audio in browser tabs selected by the user. Audio is processed locally and is never recorded or uploaded.

## Current capabilities

- Protect multiple selected tabs and keep protection active while switching tabs.
- Apply a personalized nine-band attenuation curve and fast final limiter.
- Calibrate with a low-level, hold-to-play tone and immediate Escape stop.
- Store the comfort profile locally.
- Show an `ON` toolbar badge for protected tabs.

Browser security requires the user to enable each protected tab. Extensions cannot intercept operating-system sounds or desktop applications.

## Load locally

1. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this repository folder.
4. Open a tab that plays audio and select **Protect this tab** from the toolbar popup.

Chrome internal pages and the Chrome Web Store cannot be captured.

## Verify and package

```powershell
npm test
npm run package
```

The packaged store upload is written to `dist/`. Before publishing, add final store screenshots, a support contact, and a publicly hosted copy of `PRIVACY.md`.

## Safety and scope

SonicShielding is a comfort tool, not a medical device, hearing test, or guarantee that migraine symptoms will be prevented. Digital volume is not a calibrated sound-pressure measurement and varies by output device and system volume.
