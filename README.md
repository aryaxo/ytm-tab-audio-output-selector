# 🎵 YouTube Music Tab Audio Output Selector

> A Firefox extension that lets you quickly route a YouTube Music tab to a specific audio output device.

![Firefox](https://img.shields.io/badge/Browser-Firefox-orange?logo=firefox-browser&logoColor=white)
![Manifest V2](https://img.shields.io/badge/Manifest-V2-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

---

## Why This Exists

Firefox enforces strict security restrictions that prevent extensions from automatically routing audio output without explicit user interaction. This extension makes that interaction as fast and frictionless as possible — showing a large on-screen prompt the moment playback starts, so you can confirm your device in one click.

---

## Features

| Feature | Description |
|---|---|
| 🎧 Audio output prompt | Prompts you to select an output device when playback starts |
| 🖱️ Native browser UI | Uses Firefox's built-in audio output selection dialog |
| 📢 On-screen banner | Large banner appears whenever output selection is required |
| ✔️ Auto-dismiss | Banner disappears once the output device is successfully applied |
| 🔁 Reload-aware | Re-arms automatically after page reloads that require re-authorization |
| 🌐 Scoped | Runs only on `music.youtube.com` |

---

## How It Works

1. **Playback detected** — The content script monitors the YouTube Music media element for play events.
2. **Device selection prompted** — If an output device needs to be chosen, the browser's native audio output selector is invoked via `navigator.mediaDevices.selectAudioOutput()`.
3. **Device applied** — The selected device is routed to the media element using `HTMLMediaElement.setSinkId()`.
4. **Banner dismissed** — The on-screen status banner disappears once routing succeeds.

---

## Usage

1. Open [YouTube Music](https://music.youtube.com)
2. Press **Play**
3. If prompted, choose your desired audio output device from the dialog
4. Audio from the tab will now play through that device

> **After a page reload:** Firefox may require re-authorization. Simply press **Play** again and re-select your device.

---

## Browser Support

| Browser | Supported |
|---|---|
| Firefox | ✅ Yes |
| Chrome / Edge / Other | ⚠️ Depends on API availability |

Support in other browsers requires both `navigator.mediaDevices.selectAudioOutput()` and `HTMLMediaElement.setSinkId()` to be available.

---

## Technical Details

The extension injects a content script at `document_start` on `music.youtube.com`.

**APIs used:**

```js
// Prompt the user to select an audio output device
const device = await navigator.mediaDevices.selectAudioOutput();

// Route the media element to the selected device
await mediaElement.setSinkId(device.deviceId);
```

**Permissions required:**

- `storage` — for persisting device selection across reloads
- `*://music.youtube.com/*` — content script host permission

---

## Limitations

- Firefox **requires user interaction** before allowing audio output device selection. The extension cannot bypass this — it is enforced by browser security policy.
- Re-authorization may be required after each page reload.

---

## File Structure

```
manifest.json
content_scripts/
    content.js
```

---

## License

[MIT](LICENSE)
