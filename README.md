# YT Resume

YT Resume is a lightweight Chrome Extension that remembers progress in long YouTube videos and helps you continue later.

## Features

- Tracks only `https://www.youtube.com/watch*` pages.
- Ignores videos shorter than 20 minutes.
- Starts saving after 5 minutes watched.
- Saves progress every 60 seconds while playing.
- Saves immediately on pause, `pagehide`, and hidden `visibilitychange`.
- Handles YouTube SPA navigation with `yt-navigate-finish`.
- Stores progress locally with `chrome.storage.local`.
- Shows Continue, Saved, and History tabs in a clean popup.
- Opens resume links with `https://www.youtube.com/watch?v={videoId}&t={seconds}`.
- Marks videos completed automatically at 95% watched.
- Keeps up to 10 unfinished Continue Watching videos.
- Lets users manually save up to 20 videos for later without using YouTube APIs.
- Moves saved videos into Continue Watching after the normal tracking threshold is crossed.
- Keeps completed videos in local History for 30 days.
- Uses the extension badge only for the unfinished Continue Watching count.
- Uses MV3 alarms for low-frequency resume notifications.
- No backend, accounts, cloud sync, analytics, tracking, external APIs, or AI features.

## Installation In Developer Mode

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this project folder.
5. Pin `YT Resume` from the Chrome extensions menu if desired.

## Local Development

This extension uses plain HTML, CSS, and JavaScript. No build step is required.

After editing files:

1. Open `chrome://extensions`.
2. Find `YT Resume`.
3. Click the reload button.
4. Refresh any open YouTube watch tabs.

Useful files:

- `manifest.json` declares MV3 permissions, content script scope, action popup, and icons.
- `content.js` tracks YouTube watch progress and exposes current video metadata to the popup.
- `background.js` manages alarms, notifications, badge updates, and history cleanup.
- `popup.html`, `popup.css`, and `popup.js` render the Continue, Saved, and History UI.

## Chrome Web Store Preparation

1. Verify all functionality manually in a clean Chrome profile.
2. Confirm the extension only runs on `https://www.youtube.com/watch*`.
3. Review `manifest.json` permissions and host permissions.
4. Replace placeholder icons with final branded icons.
5. Create screenshots and a concise store description.
6. Prepare a privacy policy stating that all data stays in `chrome.storage.local` and no data is collected, transmitted, sold, or shared.
7. Zip the extension files without development-only artifacts.
8. Upload the zip in the Chrome Web Store Developer Dashboard.
