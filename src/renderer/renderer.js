const params = new URLSearchParams(window.location.search);
const port = parseInt(params.get("port") || "3456", 10);
const BASE_URL = `http://localhost:${port}`;
const POLL_INTERVAL = 5000;

let lastChecked = null;

document.getElementById("port-value").textContent = `:${port}`;
document.getElementById("quit-btn").addEventListener("click", () => {
  window.electronAPI.quit();
});

async function checkStatus() {
  try {
    const res = await fetch(`${BASE_URL}/healthz`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    setStatus(data.ok ? "running" : "stopped", data.version ?? null);
  } catch {
    setStatus("stopped", null);
  }
  lastChecked = Date.now();
  updateLastChecked();
}

function setStatus(state, version) {
  const dot = document.getElementById("dot");
  const text = document.getElementById("status-text");
  const versionRow = document.getElementById("version-row");
  const versionValue = document.getElementById("version-value");

  dot.className = `dot dot-${state === "running" ? "green" : "gray"}`;
  text.textContent = state === "running" ? "Running" : "Stopped";

  if (version) {
    versionRow.classList.remove("hidden");
    versionValue.textContent = version;
  } else {
    versionRow.classList.add("hidden");
  }

  window.electronAPI.sendStatus({ ok: state === "running" });
}

function updateLastChecked() {
  if (lastChecked === null) return;
  const secs = Math.round((Date.now() - lastChecked) / 1000);
  document.getElementById("last-checked").textContent =
    secs === 0 ? "just now" : `${secs}s ago`;
}

const loginToggle = document.getElementById("login-toggle");

window.electronAPI.getLoginSetting().then((enabled) => {
  loginToggle.checked = enabled;
});

loginToggle.addEventListener("change", (e) => {
  window.electronAPI.setLoginSetting(e.target.checked);
});

checkStatus();
setInterval(checkStatus, POLL_INTERVAL);
setInterval(updateLastChecked, 1000);
