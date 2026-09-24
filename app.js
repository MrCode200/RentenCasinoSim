let CONFIG = null;
let state = null;
let eventQueue = [];
let currentEventIndex = 0;

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("de-DE", {
  style: "currency", currency: "EUR", maximumFractionDigits: 0
}).format(n);

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Konnte ${path} nicht laden (${response.status})`);
  return response.json();
}

async function init() {
  try {
    const [game, assets, rounds] = await Promise.all([
      loadJSON("data/game.json"),
      loadJSON("data/assets.json"),
      loadJSON("data/rounds.json")
    ]);
    CONFIG = { game, assets, rounds };
    resetGame();
  } catch (error) {
    $("loading").textContent =
      "Die Konfiguration konnte nicht geladen werden. Starte die App über GitHub Pages oder einen lokalen Webserver, nicht per file://.";
    console.error(error);
  }
}

function resetGame() {
  state = {
    round: 1,
    portfolio: {},
    history: [],
    lastWealth: null,
    locked: false
  };

  CONFIG.assets.forEach(asset => {
    state.portfolio[asset.id] = asset.startValue || 0;
  });

  state.history.push(totalWealth());
  $("loading").classList.add("hidden");
  $("game").classList.remove("hidden");
  render();
}

function getRound() {
  return CONFIG.rounds.find(r => r.round === state.round);
}

function totalWealth() {
  return Object.values(state.portfolio).reduce((sum, value) => sum + value, 0);
}

function render() {
  const round = getRound();
  const wealth = totalWealth();
  const previous = state.lastWealth ?? wealth;
  const diff = wealth - previous;

  $("roundNumber").textContent = state.round;
  $("roundTotal").textContent = CONFIG.game.rounds;
  $("income").textContent = money(round.income || 0);
  $("expenses").textContent = money(round.expenses || 0);
  $("cash").textContent = money(state.portfolio.cash || 0);
  $("totalWealth").textContent = money(wealth);
  $("roundTitle").textContent = round.title || `Runde ${state.round}`;
  $("roundDescription").textContent = round.description || "";
  $("phaseLabel").textContent =
    state.round >= CONFIG.game.retirementStart ? "Ruhestand" : "Berufsleben";

  const changeEl = $("wealthChange");
  if (state.lastWealth === null) {
    changeEl.textContent = "Startvermögen";
    changeEl.className = "change neutral";
  } else {
    changeEl.textContent = `${diff >= 0 ? "+" : ""}${money(diff)} gegenüber der letzten Runde`;
    changeEl.className = `change ${diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral"}`;
  }

  renderAssets();
  drawChart();
}

function renderAssets() {
  const total = Math.max(totalWealth(), 1);
  $("assets").innerHTML = CONFIG.assets.map(asset => {
    const value = state.portfolio[asset.id] || 0;
    const percentage = Math.max(0, Math.min(100, value / total * 100));
    return `
      <div class="asset-row">
        <div class="asset-top">
          <span class="asset-name">${escapeHtml(asset.name)}</span>
          <span class="asset-value">${money(value)}</span>
        </div>
        <div class="asset-bottom">
          <div class="asset-bar"><span style="width:${percentage}%"></span></div>
          <div class="asset-actions">
            <button title="100 € aus dieser Anlage entnehmen" onclick="moveMoney('${asset.id}', -100)">−</button>
            <button title="100 € in diese Anlage investieren" onclick="moveMoney('${asset.id}', 100)">+</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function moveMoney(assetId, amount) {
  if (assetId === "cash" && amount < 0) return;
  if (assetId !== "cash" && amount > 0 && (state.portfolio.cash || 0) < amount) return;
  if (assetId !== "cash" && amount < 0 && state.portfolio[assetId] < Math.abs(amount)) return;

  if (assetId === "cash") {
    if (amount > 0) return;
    // Pull money from the selected asset is intentionally handled through
    // the asset row's minus button only for non-cash assets.
    return;
  }

  if (amount > 0) {
    state.portfolio.cash -= amount;
    state.portfolio[assetId] += amount;
  } else {
    state.portfolio[assetId] -= Math.abs(amount);
    state.portfolio.cash += Math.abs(amount);
  }
  render();
}

function finishRound() {
  if (state.locked) return;
  state.locked = true;

  const round = getRound();
  state.portfolio.cash += (round.income || 0) - (round.expenses || 0);
  if (state.portfolio.cash < 0) state.portfolio.cash = 0;

  state.lastWealth = totalWealth();

  eventQueue = round.events || [];
  currentEventIndex = 0;
  showNextEvent();
}

function showNextEvent() {
  if (currentEventIndex >= eventQueue.length) {
    applyMarketChanges();
    state.history.push(totalWealth());
    state.locked = false;
    render();
    showCodeOverlay();
    return;
  }

  const event = eventQueue[currentEventIndex];
  $("eventCount").textContent = `EVENT ${currentEventIndex + 1} / ${eventQueue.length}`;
  $("eventTitle").textContent = event.title;
  $("eventMessage").textContent = event.message;
  $("eventIcon").textContent = event.icon || "◈";

  $("eventChanges").innerHTML = Object.entries(event.changes || {}).map(([id, change]) => {
    const asset = CONFIG.assets.find(a => a.id === id);
    const name = asset ? asset.name : id;
    const cls = change >= 0 ? "positive-text" : "negative-text";
    return `<div class="change-line"><span>${escapeHtml(name)}</span><span class="${cls}">${change >= 0 ? "+" : ""}${change}%</span></div>`;
  }).join("");

  $("eventOverlay").classList.remove("hidden");
}

function applyMarketChanges() {
  eventQueue.forEach(event => {
    Object.entries(event.changes || {}).forEach(([id, percent]) => {
      if (state.portfolio[id] == null) return;
      state.portfolio[id] *= 1 + percent / 100;
    });
  });

  CONFIG.assets.forEach(asset => {
    if (asset.interestRate && state.portfolio[asset.id] != null) {
      state.portfolio[asset.id] *= 1 + asset.interestRate / 100;
    }
  });
}

function showCodeOverlay() {
  $("eventOverlay").classList.add("hidden");
  $("roundCode").value = "";
  $("codeError").classList.add("hidden");

  const round = getRound();
  $("codePrompt").textContent =
    round.codeHint || "Gib den Code ein, der für diese Runde angezeigt wurde.";
  $("codeOverlay").classList.remove("hidden");
  setTimeout(() => $("roundCode").focus(), 50);
}

function submitCode() {
  const round = getRound();
  if ($("roundCode").value.trim().toUpperCase() !== String(round.code).toUpperCase()) {
    $("codeError").classList.remove("hidden");
    $("roundCode").select();
    return;
  }

  $("codeOverlay").classList.add("hidden");

  if (state.round >= CONFIG.game.rounds) {
    showEnd();
    return;
  }

  state.round++;
  state.locked = false;
  render();
}

function showEnd() {
  $("finalWealth").textContent = money(totalWealth());
  $("finalMessage").textContent =
    CONFIG.game.endMessage || "Die Simulation ist beendet. Vergleiche dein verbleibendes Vermögen.";
  $("endOverlay").classList.remove("hidden");
}

function drawChart() {
  const canvas = $("wealthChart");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const values = [...state.history];
  if (values.length === 0) return;

  const pad = { left: 50, right: 18, top: 20, bottom: 35 };
  const min = Math.min(...values);
  const max = Math.max(...values, min + 1);
  const range = max - min;

  ctx.font = "12px system-ui";
  ctx.fillStyle = "#9aa7bf";
  ctx.strokeStyle = "#2b3856";
  ctx.lineWidth = 1;

  for (let i = 0; i < 4; i++) {
    const y = pad.top + (h - pad.top - pad.bottom) * i / 3;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    const val = max - range * i / 3;
    ctx.fillText(formatCompact(val), 5, y + 4);
  }

  if (values.length === 1) {
    const x = pad.left;
    const y = valueY(values[0]);
    ctx.fillStyle = "#7dd3fc";
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    return;
  }

  const xFor = i => pad.left + (w - pad.left - pad.right) * i / (values.length - 1);
  const valueY = value => pad.top + (max - value) / range * (h - pad.top - pad.bottom);

  ctx.strokeStyle = "#7dd3fc";
  ctx.lineWidth = 3;
  ctx.beginPath();
  values.forEach((value, i) => {
    const x = xFor(i), y = valueY(value);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();

  values.forEach((value, i) => {
    const x = xFor(i), y = valueY(value);
    ctx.fillStyle = "#7dd3fc";
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#9aa7bf";
    ctx.fillText(i === 0 ? "Start" : `R${i}`, x - 10, h - 10);
  });

  function valueY(value) {
    return pad.top + (max - value) / range * (h - pad.top - pad.bottom);
  }
}

function formatCompact(value) {
  return new Intl.NumberFormat("de-DE", {
    notation: "compact", maximumFractionDigits: 1
  }).format(value) + " €";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

$("finishRoundBtn").addEventListener("click", finishRound);
$("eventNextBtn").addEventListener("click", () => {
  currentEventIndex++;
  showNextEvent();
});
$("codeSubmitBtn").addEventListener("click", submitCode);
$("roundCode").addEventListener("keydown", e => {
  if (e.key === "Enter") submitCode();
});
$("restartBtn").addEventListener("click", resetGame);
$("endRestartBtn").addEventListener("click", () => {
  $("endOverlay").classList.add("hidden");
  resetGame();
});
window.addEventListener("resize", drawChart);

init();
