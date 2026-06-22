const MIN_LONG_VIDEO_SECONDS = 20 * 60;
const MIN_TRACK_SECONDS = 5 * 60;
const COMPLETED_PERCENTAGE = 95;
const SAVE_INTERVAL_MS = 60 * 1000;
const MAX_CONTINUE_VIDEOS = 10;

let activeVideoId = null;
let saveIntervalId = null;
let retryTimeoutId = null;
let trackedVideoElement = null;

function getVideoIdFromUrl() {
  try {
    const url = new URL(window.location.href);
    return url.pathname === "/watch" ? url.searchParams.get("v") : null;
  } catch (error) {
    console.error("YT Resume: failed to parse video URL", error);
    return null;
  }
}

function getVideoElement() {
  return document.querySelector("video.html5-main-video") || document.querySelector("video");
}

function getVideoTitle() {
  const selectors = [
    "h1.ytd-watch-metadata yt-formatted-string",
    "h1.title yt-formatted-string",
    "meta[name='title']"
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const title = element?.content || element?.textContent;
    if (title && title.trim()) return title.trim();
  }

  return document.title.replace(/\s*-\s*YouTube\s*$/, "").trim() || "YouTube video";
}

function getThumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

function isTrackable(video) {
  return video && Number.isFinite(video.duration) && video.duration > MIN_LONG_VIDEO_SECONDS;
}

function computeProgress(video) {
  const totalDuration = Math.floor(video.duration || 0);
  const currentTimestamp = Math.floor(video.currentTime || 0);
  const remainingDuration = Math.max(0, totalDuration - currentTimestamp);
  const progressPercentage = totalDuration > 0
    ? Math.min(100, Math.round((currentTimestamp / totalDuration) * 100))
    : 0;

  return {
    currentTimestamp,
    totalDuration,
    remainingDuration,
    progressPercentage,
    completed: progressPercentage >= COMPLETED_PERCENTAGE
  };
}

function isContinueRecord(item) {
  return item && typeof item === "object" && item.videoId && !item.completed && item.status !== "saved";
}

async function saveProgress(reason) {
  const video = trackedVideoElement || getVideoElement();
  const videoId = activeVideoId || getVideoIdFromUrl();

  if (!videoId || !isTrackable(video)) return;
  if (video.currentTime < MIN_TRACK_SECONDS) return;

  const progress = computeProgress(video);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  try {
    const allItems = await chrome.storage.local.get(null);
    const existing = allItems[videoId] || {};
    const continueVideos = Object.values(allItems).filter(isContinueRecord);
    const hasCapacity = continueVideos.some((video) => video.videoId === videoId) || continueVideos.length < MAX_CONTINUE_VIDEOS;

    if (!progress.completed && !isContinueRecord(existing) && !hasCapacity) {
      const recentLimitTime = Date.parse(allItems.ytResumeLastLimitMessage?.createdAt || "");
      const alreadyNotified = Number.isFinite(recentLimitTime) && nowMs - recentLimitTime < SAVE_INTERVAL_MS * 2;

      if (!alreadyNotified) {
        await chrome.storage.local.set({
          ytResumeLastLimitMessage: {
            message: "You already have 10 videos in Continue Watching. Finish or remove one first.",
            createdAt: now
          }
        });
      }
      return;
    }

    const payload = {
      ...existing,
      videoId,
      title: getVideoTitle(),
      thumbnailUrl: getThumbnailUrl(videoId),
      videoUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      currentTimestamp: progress.currentTimestamp,
      totalDuration: progress.totalDuration,
      remainingDuration: progress.remainingDuration,
      progressPercentage: progress.progressPercentage,
      lastWatchedAt: now,
      lastNotifiedAt: existing.lastNotifiedAt || null,
      status: progress.completed ? "completed" : "continue",
      completed: progress.completed,
      completedAt: progress.completed ? (existing.completedAt || now) : null
    };

    await chrome.storage.local.set({ [videoId]: payload });
  } catch (error) {
    console.error(`YT Resume: failed to save progress after ${reason}`, error);
  }
}

function clearSaveInterval() {
  if (saveIntervalId) {
    window.clearInterval(saveIntervalId);
    saveIntervalId = null;
  }
}

function clearRetryTimeout() {
  if (retryTimeoutId) {
    window.clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }
}

function startSaveInterval() {
  clearSaveInterval();
  saveIntervalId = window.setInterval(() => {
    const video = trackedVideoElement;
    if (video && !video.paused && !video.ended) {
      saveProgress("interval");
    }
  }, SAVE_INTERVAL_MS);
}

function handlePause() {
  saveProgress("pause");
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") {
    saveProgress("visibilitychange");
  }
}

function handlePageHide() {
  saveProgress("pagehide");
}

function attachVideoListeners(video) {
  video.addEventListener("pause", handlePause);
  video.addEventListener("ended", handlePause);
}

function detachVideoListeners() {
  if (!trackedVideoElement) return;

  trackedVideoElement.removeEventListener("pause", handlePause);
  trackedVideoElement.removeEventListener("ended", handlePause);
}

function resetTrackingState() {
  clearRetryTimeout();
  clearSaveInterval();
  detachVideoListeners();
  activeVideoId = null;
  trackedVideoElement = null;
}

function initializeForCurrentVideo() {
  resetTrackingState();

  const videoId = getVideoIdFromUrl();
  if (!videoId) return;

  const video = getVideoElement();
  if (!video) {
    retryTimeoutId = window.setTimeout(initializeForCurrentVideo, 1000);
    return;
  }

  activeVideoId = videoId;
  trackedVideoElement = video;

  attachVideoListeners(video);
  startSaveInterval();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "YT_RESUME_GET_CURRENT_VIDEO") return false;

  const videoId = getVideoIdFromUrl();
  const video = getVideoElement();

  if (!videoId) {
    sendResponse({ ok: false, error: "Open a YouTube video first." });
    return false;
  }

  sendResponse({
    ok: true,
    video: {
      videoId,
      title: getVideoTitle(),
      thumbnailUrl: getThumbnailUrl(videoId),
      videoUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      duration: Number.isFinite(video?.duration) ? Math.floor(video.duration) : null
    }
  });
  return false;
});

document.addEventListener("yt-navigate-finish", () => {
  initializeForCurrentVideo();
});

document.addEventListener("visibilitychange", handleVisibilityChange);
window.addEventListener("pagehide", handlePageHide);

initializeForCurrentVideo();
