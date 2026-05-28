const form = document.querySelector("#pingForm");
const targetInput = document.querySelector("#targetInput");
const timeoutInput = document.querySelector("#timeoutInput");
const countInput = document.querySelector("#countInput");
const pingButton = document.querySelector("#pingButton");
const autoToggle = document.querySelector("#autoToggle");
const intervalInput = document.querySelector("#intervalInput");
const statusTitle = document.querySelector("#statusTitle");
const statusDetail = document.querySelector("#statusDetail");
const signalRing = document.querySelector("#signalRing");
const signalValue = document.querySelector("#signalValue");
const serverStatus = document.querySelector("#serverStatus");
const historyList = document.querySelector("#historyList");
const clearHistory = document.querySelector("#clearHistory");
const chart = document.querySelector("#latencyChart");
const ctx = chart.getContext("2d");

const localHistory = [];
let autoTimer = null;
let inFlight = false;

function setApiStatus(online) {
  serverStatus.classList.toggle("online", online);
  serverStatus.classList.toggle("offline", !online);
}

async function checkApi() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    setApiStatus(response.ok);
  } catch {
    setApiStatus(false);
  }
}

function setCurrentState(state, resultOrMessage) {
  signalRing.className = "signal-ring";

  if (state === "loading") {
    statusTitle.textContent = "Pingando";
    statusDetail.textContent = "Medindo resposta do destino.";
    signalValue.textContent = "...";
    return;
  }

  if (state === "error") {
    signalRing.classList.add("offline");
    statusTitle.textContent = "Erro";
    statusDetail.textContent = resultOrMessage;
    signalValue.textContent = "--";
    return;
  }

  if (!resultOrMessage) {
    statusTitle.textContent = "Pronto";
    statusDetail.textContent = "Aguardando destino.";
    signalValue.textContent = "--";
    drawChart();
    return;
  }

  const result = resultOrMessage;
  signalRing.classList.add(result.online ? "online" : "offline");
  statusTitle.textContent = result.online ? "Online" : "Offline";
  statusDetail.textContent = `${result.target} - ${formatTime(result.checkedAt)}`;
  signalValue.textContent = result.online && result.latencyMs !== null ? `${Math.round(result.latencyMs)}ms` : "OFF";
}

function formatTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function addHistory(result) {
  localHistory.unshift(result);
  localHistory.splice(24);
  renderHistory();
  drawChart();
}

function renderHistory() {
  historyList.innerHTML = "";

  if (!localHistory.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "Nenhum teste ainda";
    historyList.append(empty);
    return;
  }

  for (const result of localHistory) {
    const item = document.createElement("li");
    item.className = "history-item";

    const dot = document.createElement("span");
    dot.className = `history-dot${result.online ? " online" : ""}`;

    const main = document.createElement("div");
    const target = document.createElement("div");
    target.className = "history-target";
    target.textContent = result.target;

    const time = document.createElement("div");
    time.className = "history-time";
    time.textContent = formatTime(result.checkedAt);

    const latency = document.createElement("div");
    latency.className = "history-latency";
    latency.textContent = result.online && result.latencyMs !== null ? `${result.latencyMs} ms` : "offline";

    main.append(target, time);
    item.append(dot, main, latency);
    historyList.append(item);
  }
}

function drawChart() {
  const width = chart.width;
  const height = chart.height;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#d9e1de";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const points = localHistory
    .slice()
    .reverse()
    .filter((item) => item.online && item.latencyMs !== null)
    .slice(-18);

  if (!points.length) {
    ctx.fillStyle = "#68737d";
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("--", width / 2, height / 2 + 8);
    return;
  }

  const max = Math.max(20, ...points.map((item) => item.latencyMs));
  const pad = 20;
  const step = points.length === 1 ? 0 : (width - pad * 2) / (points.length - 1);

  ctx.strokeStyle = "#2f66d0";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  points.forEach((item, index) => {
    const x = points.length === 1 ? width / 2 : pad + index * step;
    const y = height - pad - (item.latencyMs / max) * (height - pad * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  for (const [index, item] of points.entries()) {
    const x = points.length === 1 ? width / 2 : pad + index * step;
    const y = height - pad - (item.latencyMs / max) * (height - pad * 2);
    ctx.fillStyle = "#1a9b6c";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function pingTarget() {
  if (inFlight) return;

  const target = targetInput.value.trim();
  if (!target) {
    setCurrentState("error", "Informe um IP ou dominio.");
    targetInput.focus();
    return;
  }

  inFlight = true;
  pingButton.disabled = true;
  setCurrentState("loading");

  try {
    const response = await fetch("/api/ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target,
        timeoutMs: timeoutInput.value,
        count: countInput.value
      })
    });
    const payload = await response.json();

    if (!payload.ok) {
      setCurrentState("error", payload.error || "Falha no ping.");
      return;
    }

    setCurrentState("done", payload.result);
    addHistory(payload.result);
  } catch {
    setCurrentState("error", "API indisponivel.");
    setApiStatus(false);
  } finally {
    inFlight = false;
    pingButton.disabled = false;
  }
}

function syncAutoTimer() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }

  if (!autoToggle.checked) return;

  pingTarget();
  autoTimer = setInterval(pingTarget, Number(intervalInput.value));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  pingTarget();
});

document.querySelectorAll("[data-target]").forEach((button) => {
  button.addEventListener("click", () => {
    targetInput.value = button.dataset.target;
    pingTarget();
  });
});

autoToggle.addEventListener("change", syncAutoTimer);
intervalInput.addEventListener("change", syncAutoTimer);

clearHistory.addEventListener("click", () => {
  localHistory.splice(0);
  renderHistory();
  setCurrentState("idle");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

renderHistory();
drawChart();
checkApi();
setInterval(checkApi, 30_000);
