const params = new URLSearchParams(window.location.search);
const port = parseInt(params.get("port") || "8766", 10);
const BASE_URL = `http://localhost:${port}`;
const DEFAULT_POLL_MS = 2000;
const MIN_POLL_MS = 500;
const MAX_POLL_MS = 3600_000;
const MAX_LOGS = 5000;
const PAGE_SIZE = 500;

let logs = [];
let filteredLogs = [];
let currentFilter = 'all';
let searchQuery = '';
let autoScroll = true;
let isConnected = false;
let currentOffset = 0;
let knownTotal = 0;
let oldestIndex = 0;
let hasOlder = false;
let pollIntervalMs = DEFAULT_POLL_MS;
let pollTimer = null;

const logsContainer = document.getElementById("logs-container");
const logCountEl = document.getElementById("log-count");
const statusEl = document.getElementById("status-text");
const levelFilter = document.getElementById("level-filter");
const searchInput = document.getElementById("search-input");
const searchClearBtn = document.getElementById("search-clear");
const autoScrollCheckbox = document.getElementById("auto-scroll");
const pollIntervalSelect = document.getElementById("poll-interval");
const customIntervalInput = document.getElementById("custom-interval");
const customIntervalUnit = document.getElementById("custom-interval-unit");
const loadOlderBtn = document.getElementById("load-older-btn");
const refreshBtn = document.getElementById("refresh-btn");
const clearBtn = document.getElementById("clear-btn");
const closeBtn = document.getElementById("close-btn");

let refreshDepth = 0;
let refreshHideTimer = null;

function setRefreshing(active) {
  if (active) {
    refreshDepth += 1;
    if (refreshHideTimer) {
      clearTimeout(refreshHideTimer);
      refreshHideTimer = null;
    }
    refreshBtn?.classList.add("spinning");
    return;
  }

  refreshDepth = Math.max(0, refreshDepth - 1);
  if (refreshDepth > 0) return;

  // Keep spin visible briefly so fast polls are still noticeable.
  refreshHideTimer = setTimeout(() => {
    refreshBtn?.classList.remove("spinning");
    refreshHideTimer = null;
  }, 250);
}

closeBtn.addEventListener("click", () => window.electronAPI.closeLogs());
clearBtn.addEventListener("click", () => clearLogs());
loadOlderBtn?.addEventListener("click", () => loadOlderLogs());
refreshBtn.addEventListener("click", () => {
  // Reload recent history from the start of the current window
  logs = [];
  filteredLogs = [];
  currentOffset = 0;
  knownTotal = 0;
  oldestIndex = 0;
  hasOlder = false;
  updateLoadOlderButton();
  renderLogs();
  fetchLogs();
});

levelFilter.addEventListener("change", (e) => {
  currentFilter = e.target.value;
  filterAndRenderLogs();
});

function updateSearchClearVisibility() {
  searchClearBtn.classList.toggle("hidden", searchQuery.length === 0);
}

function setSearchQuery(value) {
  searchQuery = value.trim();
  if (searchInput.value !== value) {
    searchInput.value = value;
  }
  updateSearchClearVisibility();
  filterAndRenderLogs();
}

searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value.trim();
  updateSearchClearVisibility();
  filterAndRenderLogs();
});

searchClearBtn.addEventListener("click", () => {
  setSearchQuery("");
  searchInput.focus();
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    setSearchQuery("");
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

autoScrollCheckbox.addEventListener("change", (e) => {
  autoScroll = e.target.checked;
  if (autoScroll) {
    scrollToBottom();
  }
});

function clampPollMs(ms) {
  if (!Number.isFinite(ms)) return DEFAULT_POLL_MS;
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.round(ms)));
}

function setCustomIntervalVisible(visible) {
  customIntervalInput.classList.toggle("hidden", !visible);
  customIntervalUnit.classList.toggle("hidden", !visible);
}

function applyPollInterval(ms) {
  pollIntervalMs = clampPollMs(ms);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchLogs, pollIntervalMs);
}

function readCustomIntervalMs() {
  const seconds = parseFloat(customIntervalInput.value);
  return clampPollMs(seconds * 1000);
}

pollIntervalSelect.addEventListener("change", () => {
  const value = pollIntervalSelect.value;
  if (value === "custom") {
    setCustomIntervalVisible(true);
    customIntervalInput.focus();
    applyPollInterval(readCustomIntervalMs());
    return;
  }
  setCustomIntervalVisible(false);
  applyPollInterval(parseInt(value, 10));
});

customIntervalInput.addEventListener("change", () => {
  if (pollIntervalSelect.value !== "custom") return;
  const ms = readCustomIntervalMs();
  customIntervalInput.value = String(ms / 1000);
  applyPollInterval(ms);
});

customIntervalInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    customIntervalInput.dispatchEvent(new Event("change"));
  }
});

function setStatus(connected, info = '') {
  isConnected = connected;
  const statusText = connected ? `Connected (Live)${info}` : "Disconnected";
  statusEl.textContent = statusText;
  statusEl.className = `status-text ${connected ? "connected" : "disconnected"}`;
}

function clearLogs() {
  logs = [];
  filteredLogs = [];
  // Keep cursor at end of stream so the next poll does not reload cleared lines.
  currentOffset = knownTotal || currentOffset;
  oldestIndex = currentOffset;
  hasOlder = currentOffset > 0;
  updateLoadOlderButton();
  renderLogs();
}

function updateLoadOlderButton() {
  if (!loadOlderBtn) return;
  loadOlderBtn.disabled = !hasOlder || oldestIndex <= 0;
  loadOlderBtn.title = hasOlder && oldestIndex > 0
    ? `Load up to ${PAGE_SIZE} older logs (currently showing from index ${oldestIndex})`
    : "No older logs in the current file window";
}

function parseLogLine(line) {
  try {
    const parsed = JSON.parse(line);
    return {
      level: parsed.level || 'info',
      time: parsed.time || new Date().toISOString(),
      msg: parsed.msg || '',
      ...parsed
    };
  } catch {
    return {
      level: 'info',
      time: new Date().toISOString(),
      msg: line,
      raw: true
    };
  }
}

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return timestamp;
  }
}

function createLogElement(log) {
  const entry = document.createElement('div');
  entry.className = `log-entry level-${log.level}`;
  
  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = formatTime(log.time);
  
  const level = document.createElement('span');
  level.className = `log-level level-${log.level}`;
  level.textContent = log.level;
  
  const message = document.createElement('span');
  message.className = 'log-message';
  message.textContent = log.msg;
  
  entry.appendChild(time);
  entry.appendChild(level);
  entry.appendChild(message);
  
  if (!log.raw && log.component) {
    const fields = document.createElement('div');
    fields.className = 'log-fields';
    fields.textContent = `[${log.component}]`;
    entry.appendChild(fields);
  }
  
  return entry;
}

function logMatchesSearch(log, query) {
  if (!query) return true;
  const haystacks = [log.msg, log.level, log.component, log.time]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return haystacks.some((text) => text.includes(query));
}

function filterLogs() {
  const query = searchQuery.toLowerCase();
  filteredLogs = logs.filter((log) => {
    if (currentFilter !== 'all' && log.level !== currentFilter) {
      return false;
    }
    return logMatchesSearch(log, query);
  });
}

function renderLogs() {
  // Always remove previous entries first (including clear → empty).
  logsContainer.querySelectorAll('.log-entry').forEach((el) => el.remove());

  const placeholder = logsContainer.querySelector('.logs-placeholder');
  const placeholderText = placeholder?.querySelector('.placeholder-text');
  const isFiltering = currentFilter !== 'all' || searchQuery.length > 0;

  if (filteredLogs.length === 0) {
    logsContainer.classList.remove('has-logs');
    if (placeholder) placeholder.style.display = 'flex';
    if (placeholderText) {
      placeholderText.textContent = logs.length === 0
        ? 'No logs yet. Waiting for data...'
        : isFiltering
          ? 'No logs match the current filters.'
          : 'No logs yet. Waiting for data...';
    }
  } else {
    logsContainer.classList.add('has-logs');
    if (placeholder) placeholder.style.display = 'none';
    filteredLogs.forEach((log) => {
      logsContainer.appendChild(createLogElement(log));
    });
    if (autoScroll) scrollToBottom();
  }

  if (isFiltering && logs.length !== filteredLogs.length) {
    logCountEl.textContent = `${filteredLogs.length} / ${logs.length} loaded`;
  } else {
    logCountEl.textContent = `${filteredLogs.length} loaded`;
  }
}

function filterAndRenderLogs() {
  filterLogs();
  renderLogs();
}

function scrollToBottom() {
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

async function fetchLogs() {
  setRefreshing(true);
  try {
    const data = await window.electronAPI.fetchLogs({
      since: currentOffset,
      limit: PAGE_SIZE,
    });

    if (!data || data.ok === false) {
      setStatus(false, data?.error ? ` • ${data.error}` : "");
      return;
    }

    if (typeof data.total === "number") knownTotal = data.total;

    if (data.logs && Array.isArray(data.logs) && data.logs.length > 0) {
      const newLogs = data.logs.map(parseLogLine);
      if (currentOffset === 0 && logs.length === 0) {
        logs = newLogs.slice(-MAX_LOGS);
        oldestIndex = data.oldestIndex ?? 0;
      } else {
        logs = [...logs, ...newLogs].slice(-MAX_LOGS);
      }
      currentOffset = data.offset ?? currentOffset;
      filterAndRenderLogs();
    } else if (data.offset !== undefined) {
      currentOffset = data.offset;
    }

    hasOlder = oldestIndex > 0;
    updateLoadOlderButton();
    const parts = [];
    if (data.source) parts.push(data.source);
    parts.push(`${logs.length} loaded / ${knownTotal} available`);
    if (data.truncated) parts.push("recent window");
    setStatus(true, parts.length ? ` • ${parts.join(" • ")}` : "");
  } catch (error) {
    setStatus(false);
    console.error("Failed to fetch logs:", error);
  } finally {
    setRefreshing(false);
  }
}

async function loadOlderLogs() {
  if (!hasOlder || oldestIndex <= 0) return;
  setRefreshing(true);
  const prevScrollHeight = logsContainer.scrollHeight;
  const prevScrollTop = logsContainer.scrollTop;
  try {
    const data = await window.electronAPI.fetchLogs({
      before: oldestIndex,
      limit: PAGE_SIZE,
    });
    if (!data || data.ok === false || !data.logs?.length) {
      hasOlder = false;
      updateLoadOlderButton();
      return;
    }
    const olderLogs = data.logs.map(parseLogLine);
    oldestIndex = data.oldestIndex ?? Math.max(0, oldestIndex - olderLogs.length);
    hasOlder = (data.hasOlder && oldestIndex > 0) || oldestIndex > 0;
    logs = [...olderLogs, ...logs].slice(0, MAX_LOGS);
    // Keep live cursor at end
    if (typeof data.total === "number") knownTotal = data.total;
    if (typeof data.offset === "number") currentOffset = Math.max(currentOffset, data.offset);
    const wasAuto = autoScroll;
    autoScroll = false;
    filterAndRenderLogs();
    autoScroll = wasAuto;
    // Preserve viewport position after prepending
    logsContainer.scrollTop = logsContainer.scrollHeight - prevScrollHeight + prevScrollTop;
    const parts = [];
    if (data.source) parts.push(data.source);
    parts.push(`${logs.length} loaded / ${knownTotal} available`);
    if (data.truncated) parts.push("recent window");
    setStatus(true, parts.length ? ` • ${parts.join(" • ")}` : "");
    updateLoadOlderButton();
  } catch (error) {
    console.error("Failed to load older logs:", error);
  } finally {
    setRefreshing(false);
  }
}

function startPolling() {
  fetchLogs();
  applyPollInterval(pollIntervalMs);
}

startPolling();
