# Changes Required

## Bug 1 — Stale retry timeout (`content.js:169`)

**Problem:**
The `window.setTimeout(initializeForCurrentVideo, 1000)` call does not store its timeout ID. `resetTrackingState()` has no way to cancel it. If `yt-navigate-finish` fires during the 1-second retry window, the stale timeout still fires after the reset, re-enters `initializeForCurrentVideo`, reads the new URL, and sets up a second tracking session for the already-initialised video. On back-to-back fast navigations, multiple stale timeouts can queue.

**Fix:**
Add a `retryTimeoutId` variable, cancel it in `resetTrackingState`, and store the ID when scheduling.

```js
// add at top with other module-level variables
let retryTimeoutId = null;

// add clearRetryTimeout helper alongside clearSaveInterval
function clearRetryTimeout() {
  if (retryTimeoutId) {
    window.clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }
}

// call it first inside resetTrackingState
function resetTrackingState() {
  clearRetryTimeout(); // add this line
  clearSaveInterval();
  detachVideoListeners();
  activeVideoId = null;
  trackedVideoElement = null;
}

// store the ID instead of discarding it
if (!video) {
  retryTimeoutId = window.setTimeout(initializeForCurrentVideo, 1000);
  return;
}
```

---

## Bug 2 — Unawaited promise in alarm handler (`background.js:120`)

**Problem:**
`checkVideosForNotifications()` returns a promise that is dropped. Any rejection from `chrome.storage.local.get`, `chrome.notifications.create`, or `markNotified` is silently swallowed and never logged.

**Fix:**
Chain a `.catch()` to surface errors.

```js
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkVideosForNotifications().catch((err) => {
      console.error("YT Resume: alarm check failed", err);
    });
  }
});
```

---

## Bug 3 — Dead `timeupdate` listener and `hasStartedTracking` flag (`content.js:6, 132–150`)

**Problem:**
`attachVideoListeners` installs a `timeupdate` handler whose only side-effect is setting `hasStartedTracking = true`. That flag is never read in any guard or branch anywhere in the codebase — it is only written. The listener fires several times per second during playback for no observable effect. The variable, the handler closure, and both the `addEventListener` and `removeEventListener` calls are dead code.

**Fix:**
Remove all four of the following:

1. The `hasStartedTracking` module-level variable declaration.
2. The `hasStartedTracking = false` reset inside `resetTrackingState`.
3. The `hasStartedTracking = true` write inside `saveProgress`.
4. The `trackedTimeUpdateHandler` variable, its assignment inside `attachVideoListeners`, the `video.addEventListener("timeupdate", ...)` call, and the matching `removeEventListener` + `trackedTimeUpdateHandler = null` lines inside `detachVideoListeners`.

After removal `attachVideoListeners` and `detachVideoListeners` become:

```js
function attachVideoListeners(video) {
  video.addEventListener("pause", handlePause);
  video.addEventListener("ended", handlePause);
}

function detachVideoListeners() {
  if (!trackedVideoElement) return;
  trackedVideoElement.removeEventListener("pause", handlePause);
  trackedVideoElement.removeEventListener("ended", handlePause);
}
```

---

## Bug 4 — Alarm unconditionally replaced on every browser startup (`background.js:115`)

**Problem:**
Chrome alarms persist across browser restarts. Calling `chrome.alarms.create` with an existing name replaces it, resetting the timer to a fresh `delayInMinutes: 1`. If the alarm was 50 minutes into its 60-minute cycle before the browser restarted, that progress is discarded and the next check is delayed by a full extra minute from startup. The schedule drifts on every restart.

**Fix:**
Check whether the alarm already exists before creating it.

```js
async function registerAlarms() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: ALARM_PERIOD_MINUTES
    });
  }
}
```

Both `onInstalled` and `onStartup` call `registerAlarms()`, so the alarm is created on first install and left untouched on subsequent startups.

---

## Known Race Condition (no simple fix) — `markNotified` / `saveProgress` clobber `lastNotifiedAt`

**Problem:**
Both `markNotified` (background service worker) and `saveProgress` (content script) perform a read-modify-write sequence on the same storage key:

1. `GET videoId`
2. spread existing record
3. `SET videoId` with one field changed

If `saveProgress` reads the record between `markNotified`'s `GET` and `SET`, the subsequent `saveProgress` write overwrites `lastNotifiedAt` back to `null`. On the next alarm check, the video appears un-notified and the user receives a duplicate notification.

**Why there is no minimal fix:**
Chrome's local storage API has no atomic compare-and-swap or partial field update for object values. A proper fix requires either storing `lastNotifiedAt` under a separate key (e.g., `lastNotified:{videoId}`) so the two writers never touch the same key simultaneously, or serialising all writes through the background service worker via `chrome.runtime.sendMessage`.

**Current risk:** Low probability (alarm fires hourly, content script saves every 60 s, exact overlap required), but the consequence is a visible duplicate notification. Noted in `REVIEW.md` as a last-write-wins limitation.

---

## Summary

| # | File | Line | Severity | Type |
|---|------|------|----------|------|
| 1 | `content.js` | 169 | Medium | Bug — stale retry timeout causes double-init on fast SPA navigation |
| 2 | `background.js` | 120 | Low | Bug — dropped promise silently hides all alarm-check errors |
| 3 | `content.js` | 6, 132–150 | Low | Dead code — `timeupdate` listener and `hasStartedTracking` flag do nothing |
| 4 | `background.js` | 7–12 | Low | Bug — alarm schedule reset on every browser startup |
| — | `background.js` / `content.js` | 53 / 79 | Info | Race condition — concurrent writes can clobber `lastNotifiedAt` |
