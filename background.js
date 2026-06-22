const ALARM_NAME = "yt-resume-check";
const ALARM_PERIOD_MINUTES = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_RETENTION_MS = 30 * DAY_MS;
const MIN_LONG_VIDEO_SECONDS = 20 * 60;
const MIN_NOTIFY_PROGRESS = 10;

async function registerAlarms() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    await chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: ALARM_PERIOD_MINUTES
    });
  }
}

async function getStoredVideos() {
  try {
    const items = await chrome.storage.local.get(null);
    return Object.values(items).filter((item) => item && typeof item === "object" && item.videoId);
  } catch (error) {
    console.error("YT Resume: failed to read stored videos", error);
    return [];
  }
}

function shouldNotify(video, now) {
  if (video.completed) return false;
  if (video.status === "saved") return false;
  if (!Number.isFinite(video.totalDuration) || video.totalDuration <= MIN_LONG_VIDEO_SECONDS) return false;
  if (!Number.isFinite(video.progressPercentage) || video.progressPercentage < MIN_NOTIFY_PROGRESS) return false;

  const lastWatchedAt = Date.parse(video.lastWatchedAt || "");
  if (Number.isFinite(lastWatchedAt) && now - lastWatchedAt < DAY_MS) return false;

  const lastNotifiedAt = Date.parse(video.lastNotifiedAt || "");
  if (Number.isFinite(lastNotifiedAt) && now - lastNotifiedAt < DAY_MS) return false;

  return true;
}

function isContinueRecord(item) {
  return item && typeof item === "object" && item.videoId && !item.completed && item.status !== "saved";
}

async function updateBadge() {
  try {
    const videos = await getStoredVideos();
    const count = videos.filter(isContinueRecord).length;
    await chrome.action.setBadgeBackgroundColor({ color: "#d71920" });
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  } catch (error) {
    console.error("YT Resume: failed to update badge", error);
  }
}

async function pruneHistory() {
  try {
    const items = await chrome.storage.local.get(null);
    const cutoff = Date.now() - HISTORY_RETENTION_MS;
    const expiredKeys = Object.entries(items)
      .filter(([, item]) => item && typeof item === "object" && item.videoId && (item.completed || item.status === "completed"))
      .filter(([, item]) => {
        const completedAt = Date.parse(item.completedAt || item.lastWatchedAt || "");
        return Number.isFinite(completedAt) && completedAt < cutoff;
      })
      .map(([key]) => key);

    if (expiredKeys.length > 0) {
      await chrome.storage.local.remove(expiredKeys);
    }
  } catch (error) {
    console.error("YT Resume: failed to prune history", error);
  }
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  if (safeSeconds < 60) return "<1m";

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function buildResumeUrl(video) {
  const seconds = Math.max(0, Math.floor(video.currentTimestamp || 0));
  return `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}&t=${seconds}`;
}

async function markNotified(videoId, timestamp) {
  try {
    const result = await chrome.storage.local.get(videoId);
    const existing = result[videoId];
    if (!existing) return;

    await chrome.storage.local.set({
      [videoId]: {
        ...existing,
        lastNotifiedAt: timestamp
      }
    });
  } catch (error) {
    console.error(`YT Resume: failed to update lastNotifiedAt for ${videoId}`, error);
  }
}

function clampTitle(title) {
  const maxLength = 80;
  return title.length > maxLength ? `${title.slice(0, maxLength - 3)}...` : title;
}

async function sendNotification(video, now) {
  const remaining = Number.isFinite(video.remainingDuration)
    ? video.remainingDuration
    : Math.max(0, (video.totalDuration || 0) - (video.currentTimestamp || 0));
  const title = clampTitle(video.title || "YouTube video");
  const notificationId = `yt-resume:${video.videoId}`;

  try {
    await chrome.notifications.create(notificationId, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "YT Resume",
      message: `You still have ${formatDuration(remaining)} left in '${title}'.`
    });
    await markNotified(video.videoId, new Date(now).toISOString());
  } catch (error) {
    console.error(`YT Resume: failed to notify for ${video.videoId}`, error);
  }
}

async function checkVideosForNotifications() {
  const now = Date.now();
  await pruneHistory();
  await updateBadge();
  const videos = await getStoredVideos();
  const candidates = videos.filter((video) => shouldNotify(video, now));

  for (const video of candidates) {
    await sendNotification(video, now);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  registerAlarms().catch((error) => {
    console.error("YT Resume: failed to register alarms on install", error);
  });
  pruneHistory().catch((error) => {
    console.error("YT Resume: failed to prune history on install", error);
  });
  updateBadge().catch((error) => {
    console.error("YT Resume: failed to update badge on install", error);
  });

  chrome.notifications.getPermissionLevel((level) => {
    if (chrome.runtime.lastError) {
      console.error("YT Resume: failed to check notification permission", chrome.runtime.lastError);
      return;
    }

    if (level !== "granted") {
      console.info("YT Resume: notification permission is not granted");
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  registerAlarms().catch((error) => {
    console.error("YT Resume: failed to register alarms on startup", error);
  });
  pruneHistory().catch((error) => {
    console.error("YT Resume: failed to prune history on startup", error);
  });
  updateBadge().catch((error) => {
    console.error("YT Resume: failed to update badge on startup", error);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkVideosForNotifications().catch((error) => {
      console.error("YT Resume: alarm check failed", error);
    });
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith("yt-resume:")) return;

  const videoId = notificationId.slice("yt-resume:".length);

  try {
    const result = await chrome.storage.local.get(videoId);
    const video = result[videoId];
    if (!video || video.completed) return;

    await chrome.tabs.create({ url: buildResumeUrl(video) });
    chrome.notifications.clear(notificationId);
  } catch (error) {
    console.error(`YT Resume: failed to open notification video ${videoId}`, error);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (Object.keys(changes).some((key) => key !== "ytResumeLastLimitMessage")) {
    updateBadge().catch((error) => {
      console.error("YT Resume: failed to update badge after storage change", error);
    });
  }
});
