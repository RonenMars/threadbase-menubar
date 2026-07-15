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

const logsContainer = document.getElementById("logs-container");
const logCountEl = document.getElementById("log-count");
const statusEl = document.getElementById("status-text");
const levelFilter = document.getElementById("level-filter");
const autoScrollCheckbox = document.getElementById("auto-scroll");
const refreshBtn = document.getElementById("refresh-btn");
const clearBtn = document.getElementById("clear-btn");
const closeBtn = document.getElementById("close-btn");

closeBtn.addEventListener("click", () => window.electronAPI.close());
clearBtn.addEventListener("click", () => clearLogs());
refreshBtn.addEventListener("click", () => {
  // Reset to fetch from beginning
  currentOffset = 0;
  clearLogs();
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
  currentOffset = 0;
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
    // Build URL with cursor/offset
    const url = new URL(`${BASE_URL}/api/logs`);
    url.searchParams.set('since', currentOffset.toString());
    url.searchParams.set('limit', '500');
    
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
      headers: { "X-Client": "menubar-logs" },
    });
    
    if (!response.ok) {
      setStatus(false);
      return;
    }
    
    const data = await response.json();
    
    // Update status with additional info
    const info = data.total ? ` • ${data.total} total` : '';
    setStatus(true, info);
    
    if (data.logs && Array.isArray(data.logs) && data.logs.length > 0) {
      // Parse and append new logs
      const newLogs = data.logs.map(parseLogLine);
      logs = [...logs, ...newLogs].slice(-MAX_LOGS);
      
      // Update offset for next fetch
      currentOffset = data.offset;
      
      filterAndRenderLogs();
    } else if (data.offset !== undefined) {
      // No new logs, but update offset anyway
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
