const ACCESS_CODE = "BWIHK9000";
const STORE = "bwihk_state_v1";
const SESSION_KEY = "bwihk_access";
const WRITTEN_SECONDS = 240 * 60;
const MIN_PER_POINT = 2.4;

const DOMAIN_LABELS = {
  strategie: "Unternehmensstrategie",
  rahmenbedingungen: "Recht und Finanzrahmen",
  leistungsprozesse: "Nationale und internationale Leistungsprozesse",
  organisation: "Unternehmensorganisation",
  prozesssteuerung: "Planung, Steuerung und Überwachung",
};

let CASES = [];
let mode = null;
let current = null;
let timer = { interval: null, left: 0, running: false, done: false };

function $(id) {
  return document.getElementById(id);
}

function showScreen(id) {
  ["gate-screen", "mode-screen", "list-screen", "mockpick-screen", "work-screen"]
    .forEach((name) => {
      $(name).style.display = name === id ? "" : "none";
    });
  window.scrollTo(0, 0);
}

function escapeHtml(value) {
  const holder = document.createElement("div");
  holder.textContent = value == null ? "" : String(value);
  return holder.innerHTML;
}

function formatPoints(value) {
  return (Math.round(value * 100) / 100).toString().replace(".", ",");
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return (hours ? hours + ":" : "")
    + String(minutes).padStart(2, "0") + ":"
    + String(rest).padStart(2, "0");
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch (error) {
    return {};
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch (error) {
    // Storage can be blocked in private browser modes. The exercise still works.
  }
}

function checkCode() {
  if ($("access-code-input").value.trim().toUpperCase() === ACCESS_CODE) {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch (error) {}
    showScreen("mode-screen");
  } else {
    $("gate-error").textContent = "Falscher Zugangscode. Bitte prüfen Sie das Buch.";
  }
}

$("gate-submit").addEventListener("click", checkCode);
$("access-code-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") checkCode();
});

async function ensureData() {
  if (!CASES.length) {
    const response = await fetch("cases.json");
    if (!response.ok) throw new Error("cases.json could not be loaded");
    CASES = await response.json();
  }
}

$("mode-cases").addEventListener("click", () => openList());
$("mode-mock").addEventListener("click", async () => {
  try {
    await ensureData();
  } catch (error) {
    alert("Die Inhalte konnten nicht geladen werden. Bitte laden Sie die Seite neu.");
    return;
  }
  const box = $("mock-buttons");
  box.innerHTML = "";
  [...new Set(CASES.map((item) => item.mock))]
    .sort((a, b) => a - b)
    .forEach((mock) => {
      const button = document.createElement("button");
      button.className = "btn btn-primary";
      button.textContent = "Mock " + mock;
      button.addEventListener("click", () => startMock(mock));
      box.appendChild(button);
    });
  showScreen("mockpick-screen");
});

$("back-from-list").addEventListener("click", (event) => {
  event.preventDefault();
  showScreen("mode-screen");
});
$("back-from-mockpick").addEventListener("click", () => showScreen("mode-screen"));
$("back-from-work").addEventListener("click", () => {
  if (timer.running && !confirm("Die Uhr läuft noch. Wirklich zurück?")) return;
  stopTimer();
  showScreen(mode === "mock" ? "mockpick-screen" : "list-screen");
});

async function openList() {
  try {
    await ensureData();
  } catch (error) {
    alert("Die Inhalte konnten nicht geladen werden. Bitte laden Sie die Seite neu.");
    return;
  }
  mode = "case";
  $("list-title").textContent = "Teilaufgaben";
  const mockSelect = $("filter-mock");
  const domainSelect = $("filter-domain");
  mockSelect.innerHTML = "<option value=''>Alle Mocks</option>";
  domainSelect.innerHTML = "<option value=''>Alle Handlungsbereiche</option>";
  [...new Set(CASES.map((item) => item.mock))]
    .sort((a, b) => a - b)
    .forEach((mock) => {
      const option = document.createElement("option");
      option.value = mock;
      option.textContent = "Mock " + mock;
      mockSelect.appendChild(option);
    });
  Object.entries(DOMAIN_LABELS).forEach(([key, label]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = label;
    domainSelect.appendChild(option);
  });
  mockSelect.onchange = renderList;
  domainSelect.onchange = renderList;
  renderList();
  showScreen("list-screen");
}

function renderList() {
  const mock = $("filter-mock").value;
  const domain = $("filter-domain").value;
  const state = loadState();
  const filtered = CASES.filter(
    (item) => (!mock || String(item.mock) === mock) && (!domain || item.domain === domain)
  );
  $("list-count").textContent = filtered.length + " Einträge";
  const box = $("item-list");
  box.innerHTML = "";
  filtered.forEach((item) => {
    const row = document.createElement("div");
    row.className = "station-row";
    const result = state["case_" + item.id] || "";
    const english = item.english ? " · English task" : "";
    row.innerHTML = `<div><strong>Teilaufgabe ${item.id}: ${escapeHtml(item.title)}</strong>
      <div class="sub">${escapeHtml(DOMAIN_LABELS[item.domain] || item.domain)} · Mock ${item.mock} · ${formatPoints(item.points)} Punkte${english}</div></div>
      <div class="sub">${escapeHtml(result)}</div>`;
    row.addEventListener("click", () => startCase(item));
    box.appendChild(row);
  });
}

function stopTimer() {
  clearInterval(timer.interval);
  timer.running = false;
}

function paintTimer() {
  const display = $("timer-display");
  display.textContent = formatTime(Math.max(0, timer.left));
  display.classList.toggle("amber", timer.left <= 600 && timer.left > 180);
  display.classList.toggle("red", timer.left <= 180);
}

function setupTimer(seconds, heading, subtext) {
  stopTimer();
  timer.left = seconds;
  timer.done = false;
  $("timer-heading").textContent = heading;
  $("timer-sub").textContent = subtext || "";
  $("timer-label").textContent = "Bereit";
  $("timer-start").textContent = "Uhr starten";
  $("timer-start").disabled = false;
  paintTimer();
}

function runTimer() {
  if (timer.running) return;
  timer.running = true;
  $("timer-label").textContent = "Läuft";
  $("timer-start").disabled = true;
  timer.interval = setInterval(() => {
    timer.left -= 1;
    paintTimer();
    if (timer.left <= 0) {
      stopTimer();
      timer.done = true;
      $("timer-label").textContent = "Zeit abgelaufen";
    }
  }, 1000);
}

$("timer-reset").addEventListener("click", () => {
  if (!current) return;
  if (mode === "mock") startMock(current.mock);
  else startCase(current.item);
});

function exhibitsHtml(exhibits) {
  return (exhibits || []).map((exhibit) => {
    const headers = exhibit.headers
      .map((header) => `<th>${escapeHtml(header)}</th>`).join("");
    const rows = exhibit.rows
      .map((row) => "<tr>" + row.map(
        (cell) => `<td>${escapeHtml(cell)}</td>`
      ).join("") + "</tr>").join("");
    const note = exhibit.note
      ? `<p class="note">${escapeHtml(exhibit.note)}</p>`
      : "";
    return `<p class="label">${escapeHtml(exhibit.title)}</p>
      <table class="grid"><thead><tr>${headers}</tr></thead>
      <tbody>${rows}</tbody></table>${note}`;
  }).join("");
}

function tasksHtml(caseItem) {
  return `<p class="label">Aufgaben</p>` + caseItem.tasks.map(
    (task) => `<p><strong>${escapeHtml(task.label)})</strong>
      ${escapeHtml(task.prompt)}
      <span class="tag">${formatPoints(task.points)} P</span></p>`
  ).join("");
}

function caseHtml(caseItem, companyContext) {
  const company = companyContext
    ? `<section class="panel"><h2>Das Unternehmen</h2>
      <p>${escapeHtml(companyContext)}</p></section>`
    : "";
  const english = caseItem.english ? " · English task" : "";
  return `${company}
    <section class="panel">
      <h2>Teilaufgabe ${caseItem.id}: ${escapeHtml(caseItem.title)}</h2>
      <p class="note">${escapeHtml(DOMAIN_LABELS[caseItem.domain] || caseItem.domain)}
        · ${formatPoints(caseItem.points)} Punkte${english}
        · etwa ${Math.round(caseItem.points * MIN_PER_POINT)} Minuten</p>
      <p class="label">Ausgangslage</p>
      <p>${escapeHtml(caseItem.situation)}</p>
      ${exhibitsHtml(caseItem.exhibits)}
      ${tasksHtml(caseItem)}
      <p class="label">Notizen</p>
      <textarea rows="5" placeholder="Rechenwege und Stichpunkte"></textarea>
    </section>`;
}

function reviewHtml(caseItem) {
  return caseItem.tasks.map((task, taskIndex) => `
    <div class="task">
      <h3>Aufgabe ${escapeHtml(task.label)} (${formatPoints(task.points)} Punkte)</h3>
      <p><strong>${escapeHtml(task.prompt)}</strong></p>
      <p class="label">Musterlösung</p>
      ${task.model_answer.split("\n").filter(Boolean)
        .map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
      <p class="label">Bewertungsraster: Haken setzen, was Sie geleistet haben</p>
      ${task.marking.map((mark, markIndex) => `
        <label class="checkrow">
          <input type="checkbox" data-case="${caseItem.id}"
            data-t="${taskIndex}" data-m="${markIndex}" data-p="${mark.points}">
          <span>${escapeHtml(mark.point)}
            <span class="tag">${formatPoints(mark.points)} P</span></span>
        </label>`).join("")}
    </div>`).join("")
    + `<p class="label">Häufige Prüflingsfehler</p>
       <p>${escapeHtml(caseItem.common_errors)}</p>
       <p class="label">Hinweise der Prüfer</p>
       <p>${escapeHtml(caseItem.examiner_notes)}</p>`;
}

function sumChecked(root, caseId) {
  let total = 0;
  root.querySelectorAll(`input[data-case="${caseId}"]:checked`)
    .forEach((input) => {
      total += parseFloat(input.dataset.p);
    });
  return total;
}

function showReview(caseItems, root, scoreIds) {
  const total = caseItems.reduce((sum, item) => sum + item.points, 0);
  const update = () => {
    let score = 0;
    caseItems.forEach((item) => {
      score += sumChecked(root, item.id);
      const state = loadState();
      state["case_" + item.id] = formatPoints(sumChecked(root, item.id))
        + "/" + formatPoints(item.points);
      saveState(state);
    });
    const text = `Ihre Punkte: ${formatPoints(score)} von ${formatPoints(total)}.
      ${score >= 50
        ? "Sie liegen auf oder über der Übungsgrenze von 50 Punkten."
        : "Sie liegen unter der Übungsgrenze von 50 Punkten."}
      Das Raster ist das eigene Übungsraster des Buches.`;
    scoreIds.forEach((id) => {
      const box = $(id);
      if (!box) return;
      box.textContent = text;
      box.className = "score-box " + (score >= 50 ? "pass" : "fail");
    });
  };
  root.querySelectorAll("input").forEach(
    (input) => input.addEventListener("change", update)
  );
  update();
}

function startCase(caseItem) {
  mode = "case";
  current = { item: caseItem };
  $("work-title").textContent = `Teilaufgabe ${caseItem.id}`;
  $("work-badge").textContent = DOMAIN_LABELS[caseItem.domain] || caseItem.domain;
  const contextSource = CASES.find(
    (item) => item.mock === caseItem.mock && item.position === 1
  );
  $("work-body").innerHTML = caseHtml(
    caseItem, contextSource && contextSource.company_context
  );
  const seconds = Math.round(caseItem.points * MIN_PER_POINT * 60);
  setupTimer(seconds, `Uhr: ${Math.round(seconds / 60)} Minuten`,
    "Etwa 2,4 Minuten je Punkt.");
  $("timer-start").onclick = runTimer;
  $("reveal-warn").textContent = "";
  $("answer-section").style.display = "none";
  $("reveal-btn").onclick = () => {
    if (timer.running && !timer.done
        && !confirm("Die Uhr läuft noch. Wirklich schon zeigen?")) return;
    stopTimer();
    const answer = $("answer-section");
    answer.style.display = "";
    answer.innerHTML = `<h2>Bewerten Sie sich</h2>${reviewHtml(caseItem)}
      <div class="score-box" id="score-box"></div>`;
    showReview([caseItem], answer, ["score-box"]);
    answer.scrollIntoView({ behavior: "smooth" });
  };
  showScreen("work-screen");
}

function startMock(mock) {
  mode = "mock";
  const items = CASES.filter((item) => item.mock === mock)
    .sort((a, b) => a.position - b.position);
  current = { mock, items };
  $("work-title").textContent = "Situationsaufgabe Mock " + mock;
  $("work-badge").textContent = "6 Teilaufgaben · 100 Übungspunkte";
  $("work-body").innerHTML = `<section class="panel">
    <h2>Das Unternehmen</h2>
    <p>${escapeHtml(items[0].company_context)}</p>
    <p class="note">Bearbeiten Sie die Aufgaben in einer sinnvollen Reihenfolge.
      Position 6 enthält die englischsprachige Aufgabe.</p>
  </section>` + items.map((item) => caseHtml(item, null)).join("");
  setupTimer(WRITTEN_SECONDS, "Uhr: 240 Minuten",
    "Die Uhr läuft ohne Pause, wie im schriftlichen Prüfungsteil.");
  $("timer-start").onclick = runTimer;
  $("reveal-warn").textContent = "Erst nach Ablauf der Uhr oder wenn Sie fertig sind.";
  $("answer-section").style.display = "none";
  $("reveal-btn").onclick = () => {
    if (timer.running && !timer.done
        && !confirm("Die Uhr läuft noch. Wirklich beenden und bewerten?")) return;
    stopTimer();
    const answer = $("answer-section");
    answer.style.display = "";
    answer.innerHTML = `<h2>Bewerten Sie sich: Mock ${mock}</h2>
      <div class="score-box" id="score-box"></div>`
      + items.map((item) => `<h3 style="margin-top:2rem">
        Teilaufgabe ${item.id}: ${escapeHtml(item.title)}</h3>
        ${reviewHtml(item)}`).join("");
    showReview(items, answer, ["score-box"]);
    answer.scrollIntoView({ behavior: "smooth" });
  };
  showScreen("work-screen");
}
