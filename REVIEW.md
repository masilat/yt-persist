# Review Notes

## Summary Of Implemented Files

- `manifest.json`: Manifest V3 configuration, minimum Chrome version, scoped YouTube watch content script, declared permissions, popup, background service worker, and icons.
- `background.js`: Alarm registration, notification eligibility checks, notification click resume handling, badge updates, history cleanup, and local storage updates.
- `content.js`: YouTube watch-page progress tracking, SPA navigation reset through `yt-navigate-finish`, save triggers, completion marking, Continue Watching capacity checks, and local storage writes.
- `popup.html`: Popup structure with header and Continue, Saved, and History tabs.
- `popup.css`: Lightweight modern popup styling.
- `popup.js`: Local storage rendering, resume links, saved video actions, history rendering, mark done, remove, progress, and fresh remaining-time calculation.
- `icons/`: Placeholder PNG icons in required sizes.
- `README.md`: Features, Developer Mode installation, development workflow, and Chrome Web Store preparation.

## Feature Checklist

- [x] Manifest V3 service worker.
- [x] Content script scoped to `https://www.youtube.com/watch*`.
- [x] Permissions declared: `storage`, `notifications`, `alarms`, `activeTab`.
- [x] Videos shorter than 20 minutes ignored.
- [x] Tracking starts only after 5 minutes watched.
- [x] Progress saved every 60 seconds while playing.
- [x] Progress saved on pause.
- [x] Progress saved on `pagehide`.
- [x] Progress saved when `document.visibilityState` becomes `hidden`.
- [x] No `beforeunload` usage.
- [x] Completed videos marked at 95% or more.
- [x] Completed videos hidden from popup.
- [x] Remaining duration stored at save time.
- [x] Remaining duration recomputed in popup at render time.
- [x] Resume URL uses `watch?v={videoId}&t={seconds}`.
- [x] Popup supports Resume, Mark Done, and Remove.
- [x] Popup supports Save current video and Saved/History tabs.
- [x] Continue Watching is capped at 10 unfinished videos.
- [x] Saved for Later is capped at 20 videos.
- [x] Extension badge shows only the Continue Watching count.
- [x] Notifications checked by `chrome.alarms`.
- [x] Notification click opens stored timestamp.
- [x] Alarms registered in both `onInstalled` and `onStartup`.

## Fixed Bugs

- [x] `content.js`: Stale video retry timeout is tracked and cancelled during SPA navigation resets.
- [x] `background.js`: Alarm notification checks now log unexpected promise rejections.
- [x] `content.js`: Removed dead `timeupdate` listener and unused tracking flag.
- [x] `background.js`: Existing alarms are left intact instead of being recreated on every startup.
- [x] `manifest.json`: Replaced broad `tabs` permission with `activeTab`; popup access remains scoped to the user-invoked active tab, and tab creation APIs do not require broad tab metadata access.
- [x] `manifest.json`: Added `minimum_chrome_version` `102` to avoid older Chrome builds with incomplete MV3 Promise API support.
- [x] `content.js`: Removed a redundant storage read from `saveProgress` by deriving the existing record and Continue capacity from one storage snapshot.
- [x] `content.js`: Throttled Continue limit-message writes so a full list does not trigger repeated storage writes every save interval.
- [x] `popup.js`: Added error handling for popup Resume, Watch, and Watch again `chrome.tabs.create()` calls.
- [x] `background.js`: Notification tab opening already had `try/catch` error handling; retained it.
- [x] `background.js` and `popup.js`: Fixed `formatDuration()` to show `<1m` for durations under 60 seconds.
- [x] `background.js`: Clamped long notification titles before composing notification messages.
- [x] `popup.html`: Added tablist/tab/tabpanel ARIA roles and selected states.
- [x] `popup.js`: Shows `Page is still loading. Try again in a moment.` when Save current video runs before the YouTube content script is ready.

## Manual Test Checklist

- [ ] Load unpacked extension in `chrome://extensions`.
- [ ] Open a YouTube watch URL for a video longer than 20 minutes.
- [ ] Watch until at least 5 minutes and confirm a storage entry appears.
- [ ] Pause and confirm `currentTimestamp`, `remainingDuration`, and `progressPercentage` update.
- [ ] Navigate to another video without reloading the tab and confirm tracking resets after `yt-navigate-finish`.
- [ ] Confirm videos under 20 minutes are not stored.
- [ ] Watch past 95% and confirm the video is marked `completed`.
- [ ] Confirm completed videos do not appear in the popup.
- [ ] Use Resume and confirm a new tab opens with `&t={seconds}`.
- [ ] Use Save current video on a loaded YouTube watch page and confirm the video appears in Saved.
- [ ] Use Watch from Saved and confirm it opens the saved YouTube URL.
- [ ] Confirm the extension badge count matches unfinished Continue Watching videos only.
- [ ] Use Mark Done and confirm the card disappears.
- [ ] Use Remove and confirm the storage entry is deleted.
- [ ] Trigger the alarm manually from DevTools and verify notification eligibility.
- [ ] Click a notification and confirm it opens the resume URL.

## Known Limitations

- Multiple tabs writing the same `videoId` use last-write-wins behavior.
- `markNotified` and `saveProgress` can still race because both update the same storage object with read-modify-write. This known limitation is intentionally not fixed yet.
- Progress is local to the Chrome profile and does not sync across devices.
- Notification permission cannot be force-prompted by the extension; Chrome controls whether notifications are allowed.
- YouTube DOM selectors can change, so title extraction may need future adjustment.
- Placeholder icons should be replaced before public release.
- Resume intentionally opens a new tab instead of switching to an existing YouTube tab. The suggested existing-tab reuse was not applied because it changes current MVP behavior and may require broader tab querying than `activeTab`.

## Chrome Extension Loading Steps

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this repository folder.
5. Open a YouTube watch page and test the popup.

## Specific Areas Claude Should Review

- YouTube SPA navigation handling.
- Storage writes and data schema.
- Notification timing logic.
- MV3 service worker alarm lifecycle.
- Performance risks.
