const params = new URLSearchParams(window.location.search);
const port = parseInt(params.get("port") || "8766", 10);
const BASE_URL = `http://localhost:${port}`;
const DEFAULT_POLL_MS = 2000;
const MIN_POLL_MS = 500;
const MAX_POLL_MS = 3600_000;
const MAX_LOGS = 20000;
const PAGE_SIZE = 500;
const ROW_HEIGHT = 28;
const OVERSCAN = 12;

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
let virtualStart = 0;
let virtualEnd = 0;
let detailLog = null;

const logsContainer = document.getElementById("logs-container");
const logsPlaceholder = document.getElementById("logs-placeholder");
const virtualList = document.getElementById("virtual-list");
const virtualSpacer = document.getElementById("virtual-spacer");
const virtualWindow = document.getElementById("virtual-window");
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
const loadAllBtn = document.getElementById("load-all-btn");
const loadAllModal = document.getElementById("load-all-modal");
const loadAllModalBody = document.getElementById("load-all-modal-body");
const loadAllCancelBtn = document.getElementById("load-all-cancel");
const loadAllConfirmBtn = document.getElementById("load-all-confirm");
const logDetailModal = document.getElementById("log-detail-modal");
const logDetailMeta = document.getElementById("log-detail-meta");
const logDetailMessage = document.getElementById("log-detail-message");
const logDetailExtras = document.getElementById("log-detail-extras");
const logDetailCloseBtn = document.getElementById("log-detail-close");
const logDetailDoneBtn = document.getElementById("log-detail-done");
const logDetailCopyBtn = document.getElementById("log-detail-copy");
const refreshBtn = document.getElementById("refresh-btn");
const clearBtn = document.getElementById("clear-btn");
const closeBtn = document.getElementById("close-btn");

let refreshDepth = 0;
let refreshHideTimer = null;
let scrollRaf = null;

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

  refreshHideTimer = setTimeout(() => {
    refreshBtn?.classList.remove("spinning");
    refreshHideTimer = null;
  }, 250);
}

closeBtn.addEventListener("click", () => window.electronAPI.closeLogs());
clearBtn.addEventListener("click", () => clearLogs());
loadOlderBtn?.addEventListener("click", () => loadOlderLogs());
loadAllBtn?.addEventListener("click", () => requestLoadAllLogs());
loadAllCancelBtn?.addEventListener("click", () => hideLoadAllModal());
loadAllConfirmBtn?.addEventListener("click", () => {
  hideLoadAllModal();
  loadAllLogs();
});
loadAllModal?.querySelector('[data-modal-dismiss="load-all"]')?.addEventListener("click", () => hideLoadAllModal());
logDetailCloseBtn?.addEventListener("click", () => hideLogDetailModal());
logDetailDoneBtn?.addEventListener("click", () => hideLogDetailModal());
logDetailModal?.querySelector('[data-modal-dismiss="log-detail"]')?.addEventListener("click", () => hideLogDetailModal());
logDetailCopyBtn?.addEventListener("click", () => copyDetailLog());

refreshBtn.addEventListener("click", () => {
  logs = [];
  filteredLogs = [];
  currentOffset = 0;
  knownTotal = 0;
  oldestIndex = 0;
  hasOlder = false;
  updateLoadButtons();
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
    return;
  }
  if (e.key === "Escape") {
    if (logDetailModal && !logDetailModal.classList.contains("hidden")) {
      e.preventDefault();
      hideLogDetailModal();
      return;
    }
    if (loadAllModal && !loadAllModal.classList.contains("hidden")) {
      e.preventDefault();
      hideLoadAllModal();
    }
  }
});

autoScrollCheckbox.addEventListener("change", (e) => {
  autoScroll = e.target.checked;
  if (autoScroll) {
    scrollToBottom();
  }
});

logsContainer.addEventListener("scroll", () => {
  if (scrollRaf) cancelAnimationFrame(scrollRaf);
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = null;
    updateVirtualWindow();
  });
});

virtualWindow.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-expand-index]");
  if (!btn) return;
  const index = Number(btn.getAttribute("data-expand-index"));
  if (!Number.isFinite(index) || index < 0 || index >= filteredLogs.length) return;
  showLogDetailModal(filteredLogs[index]);
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
  currentOffset = knownTotal || currentOffset;
  oldestIndex = currentOffset;
  hasOlder = currentOffset > 0;
  updateLoadButtons();
  renderLogs();
}

function isFullyLoaded() {
  if (knownTotal <= 0) return false;
  if (logs.length >= MAX_LOGS) return true;
  return oldestIndex <= 0 && logs.length >= knownTotal;
}

function updateLoadButtons() {
  if (loadOlderBtn) {
    loadOlderBtn.disabled = !hasOlder || oldestIndex <= 0;
    loadOlderBtn.title = hasOlder && oldestIndex > 0
      ? `Load up to ${PAGE_SIZE} older logs (currently showing from index ${oldestIndex})`
      : "No older logs in the current file window";
  }
  if (loadAllBtn) {
    const fullyLoaded = isFullyLoaded();
    loadAllBtn.disabled = fullyLoaded || knownTotal === 0;
    if (fullyLoaded) {
      loadAllBtn.title = logs.length >= knownTotal
        ? "All available logs in the file window are loaded"
        : `Loaded the newest ${MAX_LOGS.toLocaleString()} of ${knownTotal.toLocaleString()} available logs`;
    } else if (knownTotal === 0) {
      loadAllBtn.title = "Waiting for log data…";
    } else {
      loadAllBtn.title = `Load all available logs (up to ${MAX_LOGS.toLocaleString()}) for searching`;
    }
  }
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

function formatLevel(level) {
  if (typeof level === 'number') {
    if (level <= 20) return 'debug';
    if (level <= 30) return 'info';
    if (level <= 40) return 'warn';
    return 'error';
  }
  return String(level || 'info').toLowerCase();
}

function createLogElement(log, index) {
  const levelName = formatLevel(log.level);
  const entry = document.createElement('div');
  entry.className = `log-entry level-${levelName}`;
  entry.style.height = `${ROW_HEIGHT}px`;
  entry.dataset.index = String(index);

  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = formatTime(log.time);

  const level = document.createElement('span');
  level.className = `log-level level-${levelName}`;
  level.textContent = levelName;

  const message = document.createElement('span');
  message.className = 'log-message';
  message.textContent = log.msg || '';
  message.title = log.msg || '';

  entry.appendChild(time);
  entry.appendChild(level);
  entry.appendChild(message);

  if (!log.raw && log.component) {
    const component = document.createElement('span');
    component.className = 'log-component';
    component.textContent = `[${log.component}]`;
    component.title = String(log.component);
    entry.appendChild(component);
  }

  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = 'log-expand-btn';
  expand.setAttribute('data-expand-index', String(index));
  expand.setAttribute('aria-label', 'View full log');
  expand.title = 'View full log';
  expand.textContent = '🔍';
  entry.appendChild(expand);

  return entry;
}

function logMatchesSearch(log, query) {
  if (!query) return true;
  const haystacks = [log.msg, log.level, log.component, log.time]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map((value) => String(value).toLowerCase());
  return haystacks.some((text) => text.includes(query));
}

function filterLogs() {
  const query = searchQuery.toLowerCase();
  filteredLogs = logs.filter((log) => {
    const levelName = formatLevel(log.level);
    if (currentFilter !== 'all' && levelName !== currentFilter) {
      return false;
    }
    return logMatchesSearch(log, query);
  });
}

function updateLogCount() {
  const isFiltering = currentFilter !== 'all' || searchQuery.length > 0;
  if (isFiltering && logs.length !== filteredLogs.length) {
    logCountEl.textContent = `${filteredLogs.length} / ${logs.length} loaded`;
  } else {
    logCountEl.textContent = `${filteredLogs.length} loaded`;
  }
}

function updateVirtualWindow(force = false) {
  const total = filteredLogs.length;
  if (total === 0) {
    virtualWindow.innerHTML = '';
    virtualSpacer.style.height = '0px';
    virtualStart = 0;
    virtualEnd = 0;
    return;
  }

  const viewportHeight = logsContainer.clientHeight || 0;
  const scrollTop = logsContainer.scrollTop || 0;
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + 1;
  let start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  let end = Math.min(total, start + visibleCount + OVERSCAN * 2);
  if (end - start < visibleCount + OVERSCAN) {
    start = Math.max(0, end - (visibleCount + OVERSCAN * 2));
  }

  virtualSpacer.style.height = `${total * ROW_HEIGHT}px`;

  if (!force && start === virtualStart && end === virtualEnd) {
    virtualWindow.style.transform = `translateY(${start * ROW_HEIGHT}px)`;
    return;
  }

  virtualStart = start;
  virtualEnd = end;
  virtualWindow.style.transform = `translateY(${start * ROW_HEIGHT}px)`;

  const frag = document.createDocumentFragment();
  for (let i = start; i < end; i += 1) {
    frag.appendChild(createLogElement(filteredLogs[i], i));
  }
  virtualWindow.replaceChildren(frag);
}

function renderLogs() {
  const placeholderText = logsPlaceholder?.querySelector('.placeholder-text');
  const isFiltering = currentFilter !== 'all' || searchQuery.length > 0;

  if (filteredLogs.length === 0) {
    logsContainer.classList.remove('has-logs');
    logsPlaceholder?.classList.remove('hidden');
    virtualList?.classList.add('hidden');
    virtualWindow.innerHTML = '';
    virtualSpacer.style.height = '0px';
    if (placeholderText) {
      placeholderText.textContent = logs.length === 0
        ? 'No logs yet. Waiting for data...'
        : isFiltering
          ? 'No logs match the current filters.'
          : 'No logs yet. Waiting for data...';
    }
  } else {
    logsContainer.classList.add('has-logs');
    logsPlaceholder?.classList.add('hidden');
    virtualList?.classList.remove('hidden');
    updateVirtualWindow(true);
    if (autoScroll) scrollToBottom();
  }

  updateLogCount();
}

function filterAndRenderLogs() {
  filterLogs();
  renderLogs();
}

function scrollToBottom() {
  logsContainer.scrollTop = logsContainer.scrollHeight;
  updateVirtualWindow();
}

function hideLoadAllModal() {
  loadAllModal?.classList.add("hidden");
}

function estimatedLoadCount() {
  if (knownTotal <= 0) return MAX_LOGS;
  return Math.min(knownTotal, MAX_LOGS);
}

function showLoadAllModal() {
  const count = estimatedLoadCount();
  const already = logs.length;
  const lines = [
    `This will load about ${count.toLocaleString()} logs into memory (currently ${already.toLocaleString()} loaded).`,
    "",
    "Rows are virtualized, but very large loads can still use more memory and make filtering slower.",
    "",
    "Search only runs on loaded logs. Continue?",
  ];
  if (knownTotal > MAX_LOGS) {
    lines.splice(1, 0, `Only the newest ${MAX_LOGS.toLocaleString()} of ${knownTotal.toLocaleString()} available lines will be kept.`);
  }
  if (loadAllModalBody) loadAllModalBody.textContent = lines.join("\n");
  loadAllModal?.classList.remove("hidden");
  loadAllConfirmBtn?.focus();
}

function requestLoadAllLogs() {
  if (isFullyLoaded() || loadAllBtn?.disabled) return;
  showLoadAllModal();
}

function buildDetailExtras(log) {
  const skip = new Set(['level', 'time', 'msg', 'raw', 'component']);
  const extras = {};
  for (const [key, value] of Object.entries(log)) {
    if (skip.has(key)) continue;
    extras[key] = value;
  }
  return extras;
}

function showLogDetailModal(log) {
  detailLog = log;
  const levelName = formatLevel(log.level);
  logDetailMeta.innerHTML = '';

  const chips = [
    ['Time', `${formatTime(log.time)}`],
    ['Level', levelName],
  ];
  if (log.component) chips.push(['Component', String(log.component)]);
  if (log.time) chips.push(['Raw time', String(log.time)]);

  for (const [label, value] of chips) {
    const span = document.createElement('span');
    span.innerHTML = `<strong>${label}:</strong> `;
    span.appendChild(document.createTextNode(value));
    logDetailMeta.appendChild(span);
  }

  logDetailMessage.textContent = log.msg || '';

  const extras = buildDetailExtras(log);
  const extraKeys = Object.keys(extras);
  if (extraKeys.length > 0) {
    logDetailExtras.textContent = JSON.stringify(extras, null, 2);
    logDetailExtras.classList.remove('hidden');
  } else {
    logDetailExtras.textContent = '';
    logDetailExtras.classList.add('hidden');
  }

  logDetailModal?.classList.remove('hidden');
  logDetailDoneBtn?.focus();
}

function hideLogDetailModal() {
  logDetailModal?.classList.add('hidden');
  detailLog = null;
}

async function copyDetailLog() {
  if (!detailLog) return;
  const payload = {
    time: detailLog.time,
    level: formatLevel(detailLog.level),
    component: detailLog.component,
    msg: detailLog.msg,
    ...buildDetailExtras(detailLog),
  };
  const text = JSON.stringify(payload, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    const prev = logDetailCopyBtn.textContent;
    logDetailCopyBtn.textContent = 'Copied';
    setTimeout(() => {
      if (logDetailCopyBtn) logDetailCopyBtn.textContent = prev || 'Copy';
    }, 1200);
  } catch (error) {
    console.error('Failed to copy log:', error);
  }
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
    updateLoadButtons();
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
      updateLoadButtons();
      return;
    }
    const olderLogs = data.logs.map(parseLogLine);
    oldestIndex = data.oldestIndex ?? Math.max(0, oldestIndex - olderLogs.length);
    hasOlder = (data.hasOlder && oldestIndex > 0) || oldestIndex > 0;
    logs = [...olderLogs, ...logs].slice(0, MAX_LOGS);
    if (typeof data.total === "number") knownTotal = data.total;
    if (typeof data.offset === "number") currentOffset = Math.max(currentOffset, data.offset);
    const wasAuto = autoScroll;
    autoScroll = false;
    filterAndRenderLogs();
    autoScroll = wasAuto;
    logsContainer.scrollTop = logsContainer.scrollHeight - prevScrollHeight + prevScrollTop;
    updateVirtualWindow();
    const parts = [];
    if (data.source) parts.push(data.source);
    parts.push(`${logs.length} loaded / ${knownTotal} available`);
    if (data.truncated) parts.push("recent window");
    setStatus(true, parts.length ? ` • ${parts.join(" • ")}` : "");
    updateLoadButtons();
  } catch (error) {
    console.error("Failed to load older logs:", error);
  } finally {
    setRefreshing(false);
  }
}

async function loadAllLogs() {
  if (isFullyLoaded() || loadAllBtn?.disabled) return;
  setRefreshing(true);
  const prevLabel = loadAllBtn?.textContent;
  if (loadAllBtn) {
    loadAllBtn.disabled = true;
    loadAllBtn.textContent = "Loading…";
  }
  const keepScrollAtBottom = autoScroll;
  try {
    const data = await window.electronAPI.fetchLogs({
      all: true,
      limit: MAX_LOGS,
    });
    if (!data || data.ok === false) {
      setStatus(false, data?.error ? ` • ${data.error}` : "");
      return;
    }

    const loaded = Array.isArray(data.logs) ? data.logs.map(parseLogLine) : [];
    logs = loaded.slice(-MAX_LOGS);
    filteredLogs = [];
    if (typeof data.total === "number") knownTotal = data.total;
    if (typeof data.offset === "number") currentOffset = data.offset;
    oldestIndex = data.oldestIndex ?? 0;
    hasOlder = (data.hasOlder && oldestIndex > 0) || oldestIndex > 0;

    if (!keepScrollAtBottom) autoScroll = false;
    filterAndRenderLogs();
    autoScroll = keepScrollAtBottom;
    if (keepScrollAtBottom) scrollToBottom();

    const parts = [];
    if (data.source) parts.push(data.source);
    parts.push(`${logs.length} loaded / ${knownTotal} available`);
    if (data.truncated) parts.push("recent window");
    if (searchQuery) parts.push("search active");
    setStatus(true, parts.length ? ` • ${parts.join(" • ")}` : "");
  } catch (error) {
    console.error("Failed to load all logs:", error);
    setStatus(false);
  } finally {
    if (loadAllBtn) loadAllBtn.textContent = prevLabel || "Load all";
    updateLoadButtons();
    setRefreshing(false);
  }
}

window.addEventListener("resize", () => updateVirtualWindow(true));

function startPolling() {
  fetchLogs();
  applyPollInterval(pollIntervalMs);
}

startPolling();
