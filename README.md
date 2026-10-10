# Browser Toolkit

A Chrome extension with four tools:

1. **Selection mini menu** (like Edge's Mini Menu)
2. **Screen recorder** that saves **MP4**
3. **Screenshot tools** (visible area, full page, Windows Snipping Tool)
4. **Download router** that sorts downloads into folders by file type

## Settings

Click the gear in the toolbar popup to switch each tool on or off: Screen recorder, Screenshots, Selection menu, Discord Send button and Sort downloads. Turned-off tools also disappear from the popup. The download folder rules are further down the same page.

## 1. Selection mini menu

Select any text and a small popup appears at the end of your selection.

- **Copy** and **Search Google** icons
- **3-dot menu** styled like a right-click menu: Copy, Search Google, Translate, Define, Read aloud, Select all, Print, Hide on this site
- Keeps clear of the site's own selection popups (such as "Reply" on Claude or "Ask ChatGPT"): if one is in the way it moves below, beside or above the selection instead
- Disappears when you move the mouse away, scroll, press `Esc`, or right-click
- Turn it on/off per site from the toolbar icon

## 2. Screen recorder (MP4)

Click the extension icon → **Record screen**. A recorder tab opens.

- Pick **format** (MP4 or WebM), **quality** (Original / 1080p / 720p / 480p), **frame rate** (15-60), and a **countdown**
- **Tab/system audio**, **microphone**, and a "mute my speakers while recording" option
- Click **Capture screen**, then choose a tab, window, or the entire screen in Chrome's picker (switch on **Share tab audio** to record the sound)
- **Pause / Resume / Stop** from the recorder tab or from the toolbar icon
- **Auto-stop:** recording stops by itself when a Google Meet or Zoom (web) meeting ends. Switch it off in the recorder tab if you don't want it.
- **Join prompt:** when you join a Google Meet or Zoom (web) meeting, a small "Record this meeting?" card appears. Click **Record**, then **Start recording** in the recorder tab (Chrome needs one click there before it shows its share picker).
- **Meeting name in file names:** `Google Meet - abc-defg-hij 2026-10-09.mp4`. Other recordings use the date and time.
- **Save to a chosen folder:** pick a folder in the recorder tab (Chrome doesn't allow Downloads, Documents or Desktop themselves, so pick or create a subfolder). After restarting Chrome you may need to click **Allow access** once.
- **Crash protection:** the recording is saved in pieces as it goes. If the recorder tab closes unexpectedly, reopen it and click **Save it**. Works best with WebM.
- A red **REC** badge with the running time shows on the extension icon
- Files are saved automatically as `Recording YYYY-MM-DD HH-mm-ss.mp4`

Auto-stop works for meetings in the browser (meet.google.com and Zoom's web client). It can't detect the Zoom desktop app.

Keep the recorder tab open while recording (you can switch to other tabs).

## 3. Screenshots

From the toolbar icon:

- **Visible area**: saves a PNG and copies it to the clipboard
- **Full page**: scrolls and stitches the whole page (keep the popup open while it works)
- **Delay:** choose 3 or 5 seconds, click Visible area or Full page, and the popup closes so you can open menus or hover over things. A countdown shows on the extension icon, and the image is saved to Downloads (not copied to the clipboard).
- **Snipping Tool**: closes the popup, then opens the Windows Snipping Tool (Windows only; or press `Win+Shift+S`). The first time, Chrome asks "Open Snipping Tool?"; tick *Always allow* if offered, then click Open.

## 4. Download router

Downloads are saved into sub-folders of your Downloads folder based on their file type (for example `Downloads\\Video` for `.mp4`, `Downloads\\Images` for `.png`).

- Turn it on or off with the **Sort downloads into folders** checkbox in the toolbar popup
- **Edit folder rules** (or right-click the icon → Options) to add, change or delete folders and extensions
- Compound extensions such as `tar.gz` work, and the longest match wins
- **Export / Import** your rules as a JSON file
- It also sorts the extension's own screenshots and recordings that are saved as normal downloads. Recordings saved to a folder you chose in the recorder are not affected.
- If another download-organizer extension is installed (including the old standalone Download Router), disable it. Only one extension can choose a download's folder.

## 5. Discord Send button

- Adds a small paper-plane **Send** icon inside Discord's message box, before the gift / GIF / sticker / emoji icons
- Greyed out when the box is empty, blurple when there's something to send. Enter and Shift+Enter work as usual.
- If Discord doesn't accept the click, the icon turns red and your draft stays untouched: press Enter instead
- Only runs on `discord.com`. Turn it off under Options → Discord.

## Using it in Microsoft Edge

The same extension works in Edge (`edge://extensions` → Developer mode → Load unpacked). Edge already has its own Mini Menu and Web capture, so the **selection menu** and the **Visible area / Full page / Delay** screenshot tools are hidden there automatically. Recording, the Snipping Tool button, meeting tools and download sorting all work. To use the hidden tools in Edge anyway, turn on **Use the selection menu and screenshot tools in Edge too** in the extension's settings.

## Install (from source)

1. Download this repo: **Code → Download ZIP**, then unzip it (or `git clone`).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the folder that contains `manifest.json`.
5. Refresh any open tabs.

Needs a recent Chrome (version 126 or newer) for MP4 recording.

## Notes

- The selection menu doesn't run on Chrome internal pages (`chrome://...`) or the Chrome Web Store, and screenshots can't capture those pages either.
- Full-page screenshots work on pages that scroll normally. Sites that scroll inside an inner box may only capture one screen.
- No data is collected or sent anywhere. Search/Translate actions only open Google in a new tab.

## License

MIT, see [LICENSE](LICENSE).
