const MAX_CONTINUE_VIDEOS = 10;
const MAX_SAVED_VIDEOS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_RETENTION_MS = 30 * DAY_MS;

const elements = {
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".tab-panel"),
  continueList: document.getElementById("continue-list"),
  savedList: document.getElementById("saved-list"),
  historyList: document.getElementById("history-list"),
  continueEmpty: document.getElementById("continue-empty"),
  savedEmpty: document.getElementById("saved-empty"),
  historyEmpty: document.getElementById("history-empty"),
  continueCount: document.getElementById("continue-count"),
  savedCount: document.getElementById("saved-count"),
  limitMessage: document.getElementById("limit-message"),
  saveCurrent: document.getElementById("save-current"),
  saveMessage: document.getElementById("save-message")
};

function isVideoRecord(value) {
  return value && typeof value === "object" && typeof value.videoId === "string";
}

function isContinueVideo(video) {
  return isVideoRecord(video) && !video.completed && video.status !== "saved";
}

function isSavedVideo(video) {
  return isVideoRecord(video) && video.status === "saved" && !video.completed;
}

function isHistoryVideo(video) {
  return isVideoRecord(video) && (video.completed || video.status === "completed");
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

function formatRelativeDate(value, label) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return label;

  const days = Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
  if (days === 0) return `${label} today`;
  if (days === 1) return `${label} yesterday`;
  if (days < 30) return `${label} ${days} days ago`;

  const months = Math.max(1, Math.floor(days / 30));
  return `${label} ${months} ${months === 1 ? "month" : "months"} ago`;
}

function getFreshRemainingDuration(video) {
  return Math.max(0, Math.floor((video.totalDuration || 0) - (video.currentTimestamp || 0)));
}

function buildWatchUrl(video) {
  return video.videoUrl || `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
}

function buildResumeUrl(video) {
  const seconds = Math.max(0, Math.floor(video.currentTimestamp || 0));
  return `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}&t=${seconds}`;
}

function openTab(url, context) {
  chrome.tabs.create({ url }).catch((error) => {
    console.error(`YT Resume: failed to open ${context}`, error);
  });
}

function sortByDate(videos, field) {
  return videos.sort((a, b) => {
    const aTime = Date.parse(a[field] || "") || 0;
    const bTime = Date.parse(b[field] || "") || 0;
    return bTime - aTime;
  });
}

async function pruneHistory(items) {
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  const expiredKeys = Object.entries(items)
    .filter(([, video]) => isHistoryVideo(video))
    .filter(([, video]) => {
      const completedAt = Date.parse(video.completedAt || video.lastWatchedAt || "");
      return Number.isFinite(completedAt) && completedAt < cutoff;
    })
    .map(([key]) => key);

  if (expiredKeys.length > 0) {
    await chrome.storage.local.remove(expiredKeys);
  }
}

async function loadLists() {
  try {
    const items = await chrome.storage.local.get(null);
    await pruneHistory(items);
    const freshItems = await chrome.storage.local.get(null);
    const videos = Object.values(freshItems).filter(isVideoRecord);

    return {
      continueVideos: sortByDate(videos.filter(isContinueVideo), "lastWatchedAt"),
      savedVideos: sortByDate(videos.filter(isSavedVideo), "savedAt"),
      historyVideos: sortByDate(videos.filter(isHistoryVideo), "completedAt"),
      limitMessage: freshItems.ytResumeLastLimitMessage
    };
  } catch (error) {
    console.error("YT Resume: failed to load videos", error);
    return { continueVideos: [], savedVideos: [], historyVideos: [], limitMessage: null };
  }
}

function createButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

async function markDone(videoId) {
  try {
    const result = await chrome.storage.local.get(videoId);
    const existing = result[videoId];
    if (!existing) return;

    await chrome.storage.local.set({
      [videoId]: {
        ...existing,
        status: "completed",
        completed: true,
        completedAt: new Date().toISOString()
      }
    });
    await render();
  } catch (error) {
    console.error(`YT Resume: failed to mark ${videoId} done`, error);
  }
}

async function removeVideo(videoId) {
  try {
    await chrome.storage.local.remove(videoId);
    await render();
  } catch (error) {
    console.error(`YT Resume: failed to remove ${videoId}`, error);
  }
}

function createThumbnail(video) {
  const thumbnail = document.createElement("img");
  thumbnail.className = "thumbnail";
  thumbnail.src = video.thumbnailUrl;
  thumbnail.alt = "";
  thumbnail.loading = "lazy";
  return thumbnail;
}

function renderVideoShell(video) {
  const card = document.createElement("article");
  card.className = "video-card";

  const main = document.createElement("div");
  main.className = "video-main";

  const content = document.createElement("div");
  const title = document.createElement("p");
  title.className = "video-title";
  title.textContent = video.title || "YouTube video";

  content.append(title);
  main.append(createThumbnail(video), content);
  card.append(main);

  return { card, content };
}

function renderContinueCard(video) {
  const { card } = renderVideoShell(video);
  const progress = Math.max(0, Math.min(100, Math.round(video.progressPercentage || 0)));
  const remaining = getFreshRemainingDuration(video);

  const progressTrack = document.createElement("div");
  progressTrack.className = "progress";
  progressTrack.setAttribute("aria-label", `${progress}% watched`);

  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar";
  progressBar.style.width = `${progress}%`;
  progressTrack.append(progressBar);

  const meta = document.createElement("div");
  meta.className = "meta";
  const watched = document.createElement("span");
  watched.textContent = `${progress}% watched`;

  const remaining_text = document.createElement("span");
  remaining_text.textContent = `${formatDuration(remaining)} left`;
  remaining_text.className = "remaining-highlight";

  meta.append(watched, remaining_text);

  const resumeBtn = createButton("Resume", "primary full-width", () => openTab(buildResumeUrl(video), "resume tab"));

  const secondaryActions = document.createElement("div");
  secondaryActions.className = "actions two";
  secondaryActions.append(
    createButton("Mark Done", "secondary", () => markDone(video.videoId)),
    createButton("Remove", "danger", () => removeVideo(video.videoId))
  );

  const actions = document.createElement("div");
  actions.className = "actions-stack";
  actions.append(resumeBtn, secondaryActions);

  card.append(progressTrack, meta);
  card.append(actions);
  return card;
}

function renderSavedCard(video) {
  const { card, content } = renderVideoShell(video);
  const meta = document.createElement("div");
  meta.className = "meta single";
  meta.textContent = formatRelativeDate(video.savedAt, "Saved");

  const actions = document.createElement("div");
  actions.className = "actions two";
  actions.append(
    createButton("Watch", "primary", () => openTab(buildWatchUrl(video), "watch tab")),
    createButton("Remove", "danger", () => removeVideo(video.videoId))
  );

  content.append(meta);
  card.append(actions);
  return card;
}

function renderHistoryCard(video) {
  const { card, content } = renderVideoShell(video);
  const meta = document.createElement("div");
  meta.className = "meta single";
  meta.textContent = formatRelativeDate(video.completedAt || video.lastWatchedAt, "Completed");

  const actions = document.createElement("div");
  actions.className = "actions one";
  actions.append(createButton("Watch again", "secondary", () => openTab(buildWatchUrl(video), "history tab")));

  content.append(meta);
  card.append(actions);
  return card;
}

function setSaveMessage(message, muted = true) {
  elements.saveMessage.textContent = message;
  elements.saveMessage.classList.toggle("muted", muted);
  elements.saveMessage.hidden = !message;
}

async function saveCurrentVideo() {
  elements.saveCurrent.disabled = true;
  setSaveMessage("");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://www.youtube.com/watch")) {
      setSaveMessage("Open a YouTube video to save it.");
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "YT_RESUME_GET_CURRENT_VIDEO" });
    if (!response?.ok) {
      setSaveMessage(response?.error || "Could not read this video.");
      return;
    }

    const video = response.video;
    const items = await chrome.storage.local.get(null);
    const savedCount = Object.values(items).filter(isSavedVideo).length;
    const existing = items[video.videoId];

    if (isContinueVideo(existing)) {
      setSaveMessage("This video is already in Continue Watching.");
      return;
    }

    if (existing?.status === "completed" || existing?.completed) {
      setSaveMessage("This video is already in History.");
      return;
    }

    if (!isSavedVideo(existing) && savedCount >= MAX_SAVED_VIDEOS) {
      setSaveMessage("Saved for Later is full. Remove one first.", false);
      return;
    }

    await chrome.storage.local.set({
      [video.videoId]: {
        ...existing,
        ...video,
        savedAt: existing?.savedAt || new Date().toISOString(),
        status: "saved",
        completed: false
      }
    });

    setSaveMessage("Saved for later.");
    await render();
  } catch (error) {
    console.error("YT Resume: failed to save current video", error);
    const message = error?.message || "";
    const pageNotReady = message.includes("Could not establish connection") || message.includes("Receiving end does not exist");
    setSaveMessage(pageNotReady ? "Please refresh the YouTube page and try again." : "Could not save this video.", false);
  } finally {
    elements.saveCurrent.disabled = false;
  }
}

async function render() {
  const { continueVideos, savedVideos, historyVideos, limitMessage } = await loadLists();
  const limitMessageTime = Date.parse(limitMessage?.createdAt || "");
  const hasRecentLimitMessage = Number.isFinite(limitMessageTime) && Date.now() - limitMessageTime < DAY_MS;

  elements.continueCount.textContent = `${continueVideos.length}/${MAX_CONTINUE_VIDEOS}`;
  elements.savedCount.textContent = `${savedVideos.length}/${MAX_SAVED_VIDEOS}`;
  elements.limitMessage.hidden = continueVideos.length < MAX_CONTINUE_VIDEOS && !hasRecentLimitMessage;

  elements.continueList.replaceChildren(...continueVideos.map(renderContinueCard));
  elements.savedList.replaceChildren(...savedVideos.map(renderSavedCard));
  elements.historyList.replaceChildren(...historyVideos.map(renderHistoryCard));

  elements.continueEmpty.hidden = continueVideos.length > 0;
  elements.savedEmpty.hidden = savedVideos.length > 0;
  elements.historyEmpty.hidden = historyVideos.length > 0;
}

function switchTab(panelId) {
  elements.tabs.forEach((tab) => {
    const isActive = tab.dataset.tab === panelId;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  elements.panels.forEach((panel) => {
    const isActive = panel.id === panelId;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });
}

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

elements.saveCurrent.addEventListener("click", saveCurrentVideo);
document.addEventListener("DOMContentLoaded", render);
