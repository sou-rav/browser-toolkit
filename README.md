# Selection Mini Menu

A Chrome extension that brings an Edge-style **mini menu** to Chrome. Select any text and a small popup appears at the end of your selection.

## Features

- **Copy** and **Search Google** icons, right where your selection ends
- **3-dot menu** styled like a right-click menu: Copy, Search Google, Translate, Define, Read aloud, Select all, Print, Hide on this site
- Popup disappears when you move the mouse away, scroll, press `Esc`, or right-click
- **Double-click empty space** to open the Windows Snipping Tool (Windows only)
- Turn the menu on/off per site from the toolbar icon

## Install (from source)

1. Download this repo: click **Code → Download ZIP**, then unzip it. (Or `git clone` it.)
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).
5. Refresh any open tabs.

Works in other Chromium browsers too (Edge, Brave, etc.).

## Snipping Tool prompt

The first time you double-click empty space on a website, Chrome asks "Open Snipping Tool?". Tick **Always allow** and click **Open**. Chrome remembers this per website, so you will see the prompt once on each site.

## Notes

- The menu does not run on Chrome internal pages (`chrome://...`) or the Chrome Web Store.
- No data is collected or sent anywhere. Search/Translate actions only open Google in a new tab.

## License

MIT, see [LICENSE](LICENSE).
