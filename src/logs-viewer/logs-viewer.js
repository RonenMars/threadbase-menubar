const params = new URLSearchParams(window.location.search);
const port = parseInt(params.get("port") || "8766", 10);
const BASE_URL = `http://localhost:${port}`;
const POLL_INTERVAL = 2000;
const MAX_LOGS = 1000;

let logs = [];
let filteredLogs = [];
let currentFilter = 'all';
let autoScroll = true;
let isConnected = false;
let currentOffset = 0;
let knownTotal = 0;

const logsContainer = document.getElementById("logs-container");
const logCountEl = document.getElementById("log-count");
const statusEl = document.getElementById("status-text");
const levelFilter = document.getElementById("level-filter");
const autoScrollCheckbox = document.getElementById("auto-scroll");
const refreshBtn = document.getElementById("refresh-btn");
const clearBtn = document.getElementById("clear-btn");
const closeBtn = document.getElementById("close-btn");

closeBtn.addEventListener("click", () => window.electronAPI.closeLogs());
clearBtn.addEventListener("click", () => clearLogs());
refreshBtn.addEventListener("click", () => {
  // Reload recent history from the start of the current window
  logs = [];
  filteredLogs = [];
  currentOffset = 0;
  knownTotal = 0;
  renderLogs();
  fetchLogs();
});

levelFilter.addEventListener("change", (e) => {
  currentFilter = e.target.value;
  filterAndRenderLogs();
});

autoScrollCheckbox.addEventListener("change", (e) => {
  autoScroll = e.target.checked;
  if (autoScroll) {
    scrollToBottom();
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
  renderLogs();
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

function filterLogs() {
  if (currentFilter === 'all') {
    filteredLogs = [...logs];
  } else {
    filteredLogs = logs.filter(log => log.level === currentFilter);
  }
}

function renderLogs() {
  if (filteredLogs.length === 0) {
    logsContainer.classList.remove('has-logs');
    const placeholder = logsContainer.querySelector('.logs-placeholder');
    if (placeholder) {
      placeholder.style.display = 'flex';
    }
  } else {
    logsContainer.classList.add('has-logs');
    const placeholder = logsContainer.querySelector('.logs-placeholder');
    if (placeholder) {
      placeholder.style.display = 'none';
    }
    
    const existingLogs = logsContainer.querySelectorAll('.log-entry');
    existingLogs.forEach(el => el.remove());
    
    filteredLogs.forEach(log => {
      const logEl = createLogElement(log);
      logsContainer.appendChild(logEl);
    });
    
    if (autoScroll) {
      scrollToBottom();
    }
  }
  
  logCountEl.textContent = `${filteredLogs.length} logs`;
}

function filterAndRenderLogs() {
  filterLogs();
  renderLogs();
}

function scrollToBottom() {
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

async function fetchLogs() {
  try {
    const data = await window.electronAPI.fetchLogs({
      since: currentOffset,
      limit: 500,
    });

    if (!data || data.ok === false) {
      setStatus(false, data?.error ? ` • ${data.error}` : "");
      return;
    }

    const infoParts = [];
    if (data.source) infoParts.push(data.source);
    if (typeof data.total === "number") {
      knownTotal = data.total;
      infoParts.push(`${data.total} total`);
    }
    const info = infoParts.length ? ` • ${infoParts.join(" • ")}` : "";
    setStatus(true, info);

    if (data.logs && Array.isArray(data.logs) && data.logs.length > 0) {
      const newLogs = data.logs.map(parseLogLine);
      logs = [...logs, ...newLogs].slice(-MAX_LOGS);
      currentOffset = data.offset ?? currentOffset;
      filterAndRenderLogs();
    } else if (data.offset !== undefined) {
      currentOffset = data.offset;
    }
  } catch (error) {
    setStatus(false);
    console.error("Failed to fetch logs:", error);
  }
}

function startPolling() {
  // Initial fetch (gets last 500 logs)
  fetchLogs();
  // Poll for updates
  setInterval(fetchLogs, POLL_INTERVAL);
}

startPolling();
