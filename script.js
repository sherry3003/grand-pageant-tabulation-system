"use strict";

/* GRAND PAGEANT TABULATION SYSTEM
   Academic prototype using localStorage.
   Equal totals share the same rank. Ties must follow
   the pageant committee's approved tie-break rules.
*/

const STORAGE_KEY = "grandPageantTabulationData_v2";

const DEFAULT_DATA = {
  schemaVersion: 2,
  eventName: "Grand Pageant 2026",

  contestants: [
    { id: 1, number: 1, name: "Maria Santos", represent: "North District" },
    { id: 2, number: 2, name: "Angela Reyes", represent: "Central District" },
    { id: 3, number: 3, name: "Sophia Cruz", represent: "South District" },
    { id: 4, number: 4, name: "Isabella Garcia", represent: "East District" },
    { id: 5, number: 5, name: "Gabrielle Flores", represent: "West District" }
  ],

  judges: [
    { id: 1, name: "Judge One", position: "Guest Judge" },
    { id: 2, name: "Judge Two", position: "Professional Judge" },
    { id: 3, name: "Judge Three", position: "Guest Judge" }
  ],

  criteria: [
    { id: 1, name: "Beauty and Poise", weight: 30 },
    { id: 2, name: "Talent Presentation", weight: 25 },
    { id: 3, name: "Evening Gown", weight: 20 },
    { id: 4, name: "Question and Answer", weight: 25 }
  ],

  scores: []
};

const $ = id => document.getElementById(id);

let data = loadData();
let toastTimer = null;
let editingContestantId = null;
let contestantSearch = "";
let scoreSearch = "";

// --------------------------------------------------
// GENERAL HELPERS
// --------------------------------------------------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function scoreKey(contestantId, judgeId, criterionId) {
  return `${contestantId}:${judgeId}:${criterionId}`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function nextId(list) {
  return Math.max(0, ...list.map(item => Number(item.id) || 0)) + 1;
}

function byId(list, id) {
  return list.find(item => item.id === Number(id));
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function fmt(value) {
  return round2(value).toFixed(2);
}

function showToast(message, isError = false) {
  const toast = $("toast");

  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

// --------------------------------------------------
// DATA VALIDATION, LOADING, AND SAVING
// --------------------------------------------------

function validateData(candidate) {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    typeof candidate.eventName !== "string" ||
    !Array.isArray(candidate.contestants) ||
    !Array.isArray(candidate.judges) ||
    !Array.isArray(candidate.criteria) ||
    !Array.isArray(candidate.scores)
  ) {
    throw new Error("Invalid data structure.");
  }

  const checkIds = (list, label) => {
    const ids = list.map(item => item.id);

    if (
      !list.every(item =>
        Number.isSafeInteger(item.id) && item.id > 0
      ) ||
      new Set(ids).size !== ids.length
    ) {
      throw new Error("Invalid or duplicate IDs in " + label + ".");
    }
  };

  checkIds(candidate.contestants, "contestants");
  checkIds(candidate.judges, "judges");
  checkIds(candidate.criteria, "criteria");

  if (!candidate.contestants.every(c =>
    Number.isInteger(c.number) &&
    c.number > 0 &&
    typeof c.name === "string" &&
    c.name.trim() &&
    typeof c.represent === "string" &&
    c.represent.trim()
  )) {
    throw new Error("Invalid contestant record.");
  }

  if (!candidate.judges.every(j =>
    typeof j.name === "string" &&
    j.name.trim() &&
    typeof j.position === "string" &&
    j.position.trim()
  )) {
    throw new Error("Invalid judge record.");
  }

  if (!candidate.criteria.every(c =>
    typeof c.name === "string" &&
    c.name.trim() &&
    Number.isFinite(c.weight) &&
    c.weight > 0 &&
    c.weight <= 100
  )) {
    throw new Error("Invalid criterion record.");
  }

  const contestantIds = new Set(
    candidate.contestants.map(c => c.id)
  );

  const judgeIds = new Set(
    candidate.judges.map(j => j.id)
  );

  const criterionIds = new Set(
    candidate.criteria.map(c => c.id)
  );

  const scoreKeys = new Set();

  for (const score of candidate.scores) {
    if (
      !contestantIds.has(score.contestantId) ||
      !judgeIds.has(score.judgeId) ||
      !criterionIds.has(score.criterionId) ||
      !Number.isFinite(score.value) ||
      score.value < 0 ||
      score.value > 100
    ) {
      throw new Error("Invalid score record.");
    }

    const key = scoreKey(
      score.contestantId,
      score.judgeId,
      score.criterionId
    );

    if (scoreKeys.has(key)) {
      throw new Error("Duplicate score record.");
    }

    scoreKeys.add(key);
  }
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return clone(DEFAULT_DATA);
    }

    const parsed = JSON.parse(raw);
    validateData(parsed);

    return parsed;
  } catch (error) {
    console.error("Saved pageant data could not be loaded:", error);
    return clone(DEFAULT_DATA);
  }
}

function persistData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    renderAll();
    return true;
  } catch (error) {
    console.error("Could not save pageant data:", error);

    showToast(
      "Could not save data. Browser storage may be unavailable or full.",
      true
    );

    return false;
  }
}

// --------------------------------------------------
// SCORING CALCULATIONS
// --------------------------------------------------

function totalWeight() {
  return round2(
    data.criteria.reduce(
      (sum, criterion) => sum + Number(criterion.weight),
      0
    )
  );
}

function isWeightValid() {
  return (
    data.criteria.length > 0 &&
    Math.abs(totalWeight() - 100) < 0.000001
  );
}

function getScore(contestantId, judgeId, criterionId) {
  return data.scores.find(score =>
    score.contestantId === contestantId &&
    score.judgeId === judgeId &&
    score.criterionId === criterionId
  );
}

function expectedScoreCount() {
  return (
    data.contestants.length *
    data.judges.length *
    data.criteria.length
  );
}

function getCompletion() {
  const expected = expectedScoreCount();
  const actual = data.scores.length;

  return {
    expected,
    actual,
    percent: expected === 0
      ? 0
      : Math.round((actual / expected) * 100),
    complete: expected > 0 && actual === expected
  };
}

function getContestantScore(contestantId) {
  let weightedTotal = 0;
  let completedCriteria = 0;

  const criterionDetails = [];

  for (const criterion of data.criteria) {
    const values = data.judges
      .map(judge =>
        getScore(contestantId, judge.id, criterion.id)
      )
      .filter(Boolean)
      .map(score => Number(score.value));

    const expected = data.judges.length;

    const complete =
      expected > 0 && values.length === expected;

    const average = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;

    if (complete) {
      completedCriteria++;
    }

    if (average !== null) {
      weightedTotal += average * Number(criterion.weight) / 100;
    }

    criterionDetails.push({
      criterionId: criterion.id,
      name: criterion.name,
      weight: Number(criterion.weight),
      average,
      entered: values.length,
      expected,
      complete
    });
  }

  const scoresComplete =
    data.criteria.length > 0 &&
    data.judges.length > 0 &&
    completedCriteria === data.criteria.length;

  return {
    total: round2(weightedTotal),
    completedCriteria,
    totalCriteria: data.criteria.length,
    scoresComplete,
    eligible: scoresComplete && isWeightValid(),
    criterionDetails
  };
}

// --------------------------------------------------
// RANKINGS AND TIE HANDLING
// --------------------------------------------------

function getRankings() {
  const rows = data.contestants.map(contestant => ({
    ...contestant,
    ...getContestantScore(contestant.id)
  }));

  rows.sort((a, b) => {
    if (a.eligible !== b.eligible) {
      return a.eligible ? -1 : 1;
    }

    if (a.eligible && b.eligible && a.total !== b.total) {
      return b.total - a.total;
    }

    if (!a.eligible && !b.eligible) {
      if (a.completedCriteria !== b.completedCriteria) {
        return b.completedCriteria - a.completedCriteria;
      }

      if (a.total !== b.total) {
        return b.total - a.total;
      }
    }

    return a.number - b.number ||
      a.name.localeCompare(b.name);
  });

  let rank = 0;
  let previousTotal = null;
  let eligiblePosition = 0;

  for (const row of rows) {
    if (!row.eligible) {
      row.rank = null;
      row.tied = false;
      continue;
    }

    eligiblePosition++;

    if (
      previousTotal === null ||
      Math.abs(row.total - previousTotal) > 0.000001
    ) {
      rank = eligiblePosition;
    }

    row.rank = rank;

    row.tied = rows.some(other =>
      other.id !== row.id &&
      other.eligible &&
      Math.abs(other.total - row.total) <= 0.000001
    );

    previousTotal = row.total;
  }

  return rows;
}

function statusBadge(row) {
  if (row.eligible) {
    return '<span class="badge good">Complete</span>';
  }

  if (!isWeightValid()) {
    return '<span class="badge danger">Weights invalid</span>';
  }

  if (!data.judges.length || !data.criteria.length) {
    return '<span class="badge warn">Setup required</span>';
  }

  return `<span class="badge warn">${row.completedCriteria}/${row.totalCriteria} criteria</span>`;
}

function tableHTML(headers, rows, emptyMessage = "No records found.") {
  if (!rows.length) {
    return `<div class="empty-state">${escapeHTML(emptyMessage)}</div>`;
  }

  return `
    <table>
      <thead>
        <tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map(row =>
          `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`
        ).join("")}
      </tbody>
    </table>
  `;
}

// --------------------------------------------------
// NAVIGATION
// --------------------------------------------------

function showPage(pageId) {
  const page = $(pageId);

  if (!page) return;

  document.querySelectorAll(".page").forEach(section => {
    section.classList.add("hidden");
  });

  page.classList.remove("hidden");

  document.querySelectorAll(".nav").forEach(button => {
    const active = button.dataset.page === pageId;

    button.classList.toggle("active", active);

    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  const labels = {
    dashboard: ["Dashboard", "OVERVIEW"],
    contestants: ["Contestants", "PARTICIPANT DIRECTORY"],
    judges: ["Judges", "JUDGING PANEL"],
    criteria: ["Scoring Criteria", "SCORING CONFIGURATION"],
    scores: ["Score Entry", "JUDGE SCORE SHEET"],
    results: ["Final Results", "FINAL TABULATION"],
    "data-tools": ["Data & Backup", "DATA MANAGEMENT"]
  };

  $("page-title").textContent = labels[pageId][0];
  $("breadcrumb").textContent = labels[pageId][1];
}

document.querySelectorAll(".nav").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.page);
  });
});

document.querySelectorAll("[data-goto]").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.goto);
  });
});

// --------------------------------------------------
// EVENT SETTINGS
// --------------------------------------------------

$("event-settings").addEventListener("click", () => {
  const value = prompt(
    "Enter your pageant event name:",
    data.eventName
  );

  if (value === null) return;

  if (!value.trim()) {
    return showToast("Event name cannot be empty.", true);
  }

  data.eventName = value.trim().slice(0, 120);

  if (persistData()) {
    showToast("Event name updated.");
  }
});

// --------------------------------------------------
// CONTESTANT MANAGEMENT
// --------------------------------------------------

function resetContestantForm() {
  editingContestantId = null;
  $("contestant-form").reset();
  $("contestant-submit").textContent = "＋ Add contestant";
}

$("contestant-form").addEventListener("submit", event => {
  event.preventDefault();

  const number = Number($("c-number").value);
  const name = $("c-name").value.trim();
  const represent = $("c-represent").value.trim();

  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    !name ||
    !represent
  ) {
    return showToast(
      "Enter a valid number, name, and representation.",
      true
    );
  }

  if (data.contestants.some(contestant =>
    contestant.number === number &&
    contestant.id !== editingContestantId
  )) {
    return showToast(
      "That contestant number is already in use.",
      true
    );
  }

  if (editingContestantId !== null) {
    const contestant = byId(
      data.contestants,
      editingContestantId
    );

    if (!contestant) {
      return resetContestantForm();
    }

    Object.assign(contestant, {
      number,
      name,
      represent
    });

    resetContestantForm();

    if (persistData()) {
      showToast("Contestant updated.");
    }
  } else {
    data.contestants.push({
      id: nextId(data.contestants),
      number,
      name,
      represent
    });

    event.target.reset();

    if (persistData()) {
      showToast("Contestant added.");
    }
  }
});

function editContestant(id) {
  const contestant = byId(data.contestants, id);

  if (!contestant) return;

  editingContestantId = id;

  $("c-number").value = contestant.number;
  $("c-name").value = contestant.name;
  $("c-represent").value = contestant.represent;

  $("contestant-submit").textContent = "Save changes";
  $("c-number").focus();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function deleteContestant(id) {
  const contestant = byId(data.contestants, id);

  if (
    !contestant ||
    !confirm(
      `Delete contestant #${contestant.number} ${contestant.name} and all their scores?`
    )
  ) {
    return;
  }

  data.contestants = data.contestants.filter(
    item => item.id !== id
  );

  data.scores = data.scores.filter(
    score => score.contestantId !== id
  );

  if (editingContestantId === id) {
    resetContestantForm();
  }

  if (persistData()) {
    showToast("Contestant and related scores deleted.");
  }
}

$("contestant-search").addEventListener("input", event => {
  contestantSearch = event.target.value.trim().toLowerCase();
  renderContestants();
});

function renderContestants() {
  const filtered = data.contestants
    .filter(contestant =>
      String(contestant.number).includes(contestantSearch) ||
      contestant.name.toLowerCase().includes(contestantSearch) ||
      contestant.represent.toLowerCase().includes(contestantSearch)
    )
    .sort((a, b) => a.number - b.number);

  $("contestant-total").textContent =
    `${data.contestants.length} contestant${data.contestants.length === 1 ? "" : "s"}`;

  $("contestant-search-count").textContent =
    `${filtered.length} shown`;

  const rows = filtered.map(contestant => [
    `<strong>#${contestant.number}</strong>`,
    escapeHTML(contestant.name),
    escapeHTML(contestant.represent),
    `<button class="btn btn-outline" onclick="editContestant(${contestant.id})">Edit</button>
     <button class="btn btn-danger" onclick="deleteContestant(${contestant.id})">Delete</button>`
  ]);

  $("contestant-table").innerHTML = tableHTML(
    ["Number", "Full name", "Representing", "Actions"],
    rows,
    "No contestants match your search."
  );
}

// --------------------------------------------------
// JUDGE MANAGEMENT
// --------------------------------------------------

$("judge-form").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("j-name").value.trim();
  const position = $("j-position").value.trim();

  if (!name || !position) {
    return showToast("Complete all judge fields.", true);
  }

  data.judges.push({
    id: nextId(data.judges),
    name,
    position
  });

  event.target.reset();

  if (persistData()) {
    showToast("Judge added.");
  }
});

function editJudge(id) {
  const judge = byId(data.judges, id);

  if (!judge) return;

  const name = prompt("Judge name:", judge.name);
  if (name === null) return;

  const position = prompt(
    "Position / profession:",
    judge.position
  );

  if (position === null) return;

  if (!name.trim() || !position.trim()) {
    return showToast("Judge fields cannot be empty.", true);
  }

  Object.assign(judge, {
    name: name.trim(),
    position: position.trim()
  });

  if (persistData()) {
    showToast("Judge updated.");
  }
}

function deleteJudge(id) {
  const judge = byId(data.judges, id);

  if (
    !judge ||
    !confirm(
      `Delete ${judge.name} and all scores submitted by this judge?`
    )
  ) {
    return;
  }

  data.judges = data.judges.filter(
    item => item.id !== id
  );

  data.scores = data.scores.filter(
    score => score.judgeId !== id
  );

  if (persistData()) {
    showToast("Judge and related scores deleted.");
  }
}

function renderJudges() {
  $("judge-total").textContent =
    `${data.judges.length} judge${data.judges.length === 1 ? "" : "s"}`;

  const rows = data.judges.map(judge => [
    escapeHTML(judge.name),
    escapeHTML(judge.position),
    `<button class="btn btn-outline" onclick="editJudge(${judge.id})">Edit</button>
     <button class="btn btn-danger" onclick="deleteJudge(${judge.id})">Delete</button>`
  ]);

  $("judge-table").innerHTML = tableHTML(
    ["Judge name", "Position / profession", "Actions"],
    rows
  );
}

// --------------------------------------------------
// SCORING CRITERIA MANAGEMENT
// --------------------------------------------------

$("criteria-form").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("cr-name").value.trim();
  const weight = Number($("cr-weight").value);

  if (
    !name ||
    !Number.isFinite(weight) ||
    weight <= 0 ||
    weight > 100
  ) {
    return showToast(
      "Enter a criterion and a weight greater than 0 and no more than 100.",
      true
    );
  }

  if (totalWeight() + weight > 100.000001) {
    return showToast(
      `That exceeds 100%. Current total is ${fmt(totalWeight())}%.`,
      true
    );
  }

  data.criteria.push({
    id: nextId(data.criteria),
    name,
    weight: round2(weight)
  });

  event.target.reset();

  if (persistData()) {
    showToast("Criterion added.");
  }
});

function editCriterion(id) {
  const criterion = byId(data.criteria, id);

  if (!criterion) return;

  const name = prompt("Criterion name:", criterion.name);
  if (name === null) return;

  const weightText = prompt("Weight (%):", criterion.weight);
  if (weightText === null) return;

  const weight = Number(weightText);
  const otherWeights = totalWeight() - Number(criterion.weight);

  if (
    !name.trim() ||
    !Number.isFinite(weight) ||
    weight <= 0 ||
    weight > 100 ||
    otherWeights + weight > 100.000001
  ) {
    return showToast(
      "Invalid name or weight. Total cannot exceed 100%.",
      true
    );
  }

  Object.assign(criterion, {
    name: name.trim(),
    weight: round2(weight)
  });

  if (persistData()) {
    showToast("Criterion updated.");
  }
}

function deleteCriterion(id) {
  const criterion = byId(data.criteria, id);

  if (
    !criterion ||
    !confirm(
      `Delete "${criterion.name}" and all scores for this criterion?`
    )
  ) {
    return;
  }

  data.criteria = data.criteria.filter(
    item => item.id !== id
  );

  data.scores = data.scores.filter(
    score => score.criterionId !== id
  );

  if (persistData()) {
    showToast("Criterion and related scores deleted.");
  }
}

function renderCriteria() {
  $("criteria-total").textContent =
    `${data.criteria.length} criterion/criteria`;

  const total = totalWeight();
  const status = $("weight-status");

  status.className =
    "weight-status " + (isWeightValid() ? "good" : "bad");

  status.textContent = isWeightValid()
    ? `✓ Criteria weights total ${fmt(total)}%. Scoring weights are valid.`
    : `Current total: ${fmt(total)}%. Weights must total exactly 100.00% before results are eligible.`;

  const rows = data.criteria.map(criterion => [
    escapeHTML(criterion.name),
    `${fmt(criterion.weight)}%`,
    `<div class="mini-progress"><span style="width:${Math.min(100, Number(criterion.weight))}%"></span></div>`,
    `<button class="btn btn-outline" onclick="editCriterion(${criterion.id})">Edit</button>
     <button class="btn btn-danger" onclick="deleteCriterion(${criterion.id})">Delete</button>`
  ]);

  $("criteria-table").innerHTML = tableHTML(
    ["Criterion", "Weight", "Share", "Actions"],
    rows
  );
}

// --------------------------------------------------
// SCORE ENTRY
// --------------------------------------------------

$("score-form").addEventListener("submit", event => {
  event.preventDefault();

  const contestantId = Number($("s-contestant").value);
  const judgeId = Number($("s-judge").value);
  const criterionId = Number($("s-criterion").value);
  const value = Number($("s-value").value);

  if (
    !byId(data.contestants, contestantId) ||
    !byId(data.judges, judgeId) ||
    !byId(data.criteria, criterionId)
  ) {
    return showToast(
      "Add contestants, judges, and criteria first.",
      true
    );
  }

  if (!isWeightValid()) {
    showPage("criteria");

    return showToast(
      "Set criterion weights to exactly 100% before entering scores.",
      true
    );
  }

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    return showToast(
      "Score must be between 0 and 100.",
      true
    );
  }

  const existing = getScore(
    contestantId,
    judgeId,
    criterionId
  );

  if (existing) {
    if (!confirm("A score exists for this selection. Update it?")) {
      return;
    }

    existing.value = round2(value);
  } else {
    data.scores.push({
      contestantId,
      judgeId,
      criterionId,
      value: round2(value)
    });
  }

  $("s-value").value = "";

  if (persistData()) {
    showToast(existing ? "Score updated." : "Score saved.");
  }
});

function deleteScore(contestantId, judgeId, criterionId) {
  if (
    !getScore(contestantId, judgeId, criterionId) ||
    !confirm("Delete this score entry?")
  ) {
    return;
  }

  data.scores = data.scores.filter(score =>
    !(
      score.contestantId === contestantId &&
      score.judgeId === judgeId &&
      score.criterionId === criterionId
    )
  );

  if (persistData()) {
    showToast("Score deleted.");
  }
}

$("score-search").addEventListener("input", event => {
  scoreSearch = event.target.value.trim().toLowerCase();
  renderScores();
});

function updateSelectOptions() {
  const definitions = [
    {
      id: "s-contestant",
      items: data.contestants,
      label: contestant =>
        `#${contestant.number} — ${contestant.name}`
    },
    {
      id: "s-judge",
      items: data.judges,
      label: judge => judge.name
    },
    {
      id: "s-criterion",
      items: data.criteria,
      label: criterion =>
        `${criterion.name} (${fmt(criterion.weight)}%)`
    }
  ];

  for (const definition of definitions) {
    const select = $(definition.id);
    const previous = select.value;

    if (!definition.items.length) {
      select.innerHTML =
        '<option value="">Add records first</option>';

      select.disabled = true;
      continue;
    }

    select.disabled = false;

    select.innerHTML = definition.items.map(item =>
      `<option value="${item.id}">${escapeHTML(definition.label(item))}</option>`
    ).join("");

    if (
      definition.items.some(item =>
        String(item.id) === previous
      )
    ) {
      select.value = previous;
    }
  }
}

function renderScores() {
  const completion = getCompletion();

  $("score-summary").innerHTML = `
    <span class="summary-chip">
      <strong>${completion.actual}</strong> score entries saved
    </span>
    <span class="summary-chip">
      <strong>${completion.expected}</strong> entries expected
    </span>
    <span class="summary-chip">
      <strong>${completion.percent}%</strong> complete
    </span>
  `;

  const filtered = data.scores.filter(score => {
    const contestant = byId(
      data.contestants,
      score.contestantId
    );

    const judge = byId(data.judges, score.judgeId);

    const criterion = byId(
      data.criteria,
      score.criterionId
    );

    if (!contestant || !judge || !criterion) {
      return false;
    }

    const searchText = `
      ${contestant.number}
      ${contestant.name}
      ${contestant.represent}
      ${judge.name}
      ${criterion.name}
      ${score.value}
    `.toLowerCase();

    return searchText.includes(scoreSearch);
  }).sort((a, b) => {
    const contestantA = byId(
      data.contestants,
      a.contestantId
    );

    const contestantB = byId(
      data.contestants,
      b.contestantId
    );

    return contestantA.number - contestantB.number ||
      a.judgeId - b.judgeId ||
      a.criterionId - b.criterionId;
  });

  const rows = filtered.map(score => {
    const contestant = byId(
      data.contestants,
      score.contestantId
    );

    const judge = byId(data.judges, score.judgeId);

    const criterion = byId(
      data.criteria,
      score.criterionId
    );

    return [
      `#${contestant.number} ${escapeHTML(contestant.name)}`,
      escapeHTML(judge.name),
      escapeHTML(criterion.name),
      fmt(score.value),
      `<button class="btn btn-danger" onclick="deleteScore(${score.contestantId},${score.judgeId},${score.criterionId})">Delete</button>`
    ];
  });

  $("score-table").innerHTML = tableHTML(
    ["Contestant", "Judge", "Criterion", "Score", "Action"],
    rows,
    "No score entries match your search."
  );
}

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

function renderDashboard() {
  const completion = getCompletion();

  $("top-event-name").textContent = data.eventName;
  $("stat-contestants").textContent = data.contestants.length;
  $("stat-judges").textContent = data.judges.length;
  $("stat-criteria").textContent = data.criteria.length;

  $("stat-weight").textContent =
    `Total weight: ${fmt(totalWeight())}%`;

  $("stat-completion").textContent =
    `${completion.percent}%`;

  $("stat-score-count").textContent =
    `${completion.actual} of ${completion.expected} score entries`;

  $("stat-progress").style.width =
    `${completion.percent}%`;

  const rows = getRankings().slice(0, 5).map(row => [
    row.eligible
      ? `<span class="rank-number">${row.rank}</span>${row.tied ? '<span class="rank-tie">TIE</span>' : ""}`
      : "—",

    `<strong>${escapeHTML(row.name)}</strong><br>
     <span class="muted">#${row.number} · ${escapeHTML(row.represent)}</span>`,

    row.eligible
      ? `<strong>${fmt(row.total)}</strong>`
      : "Provisional",

    statusBadge(row)
  ]);

  $("dashboard-leaderboard").innerHTML = tableHTML(
    ["Rank", "Contestant", "Total", "Status"],
    rows,
    "Add contestants to see the leaderboard."
  );
}

// --------------------------------------------------
// TOP 3 PODIUM
// --------------------------------------------------

function renderPodium() {
  const eligible = getRankings().filter(row => row.eligible);
  const podium = $("podium");

  if (!eligible.length) {
    podium.innerHTML = `
      <div class="empty-state"
        style="grid-column:1/-1;border:1px dashed #ded3b8;border-radius:10px">
        Top 3 podium will appear when at least one contestant has
        complete scores and the criteria weights total 100%.
      </div>
    `;

    return;
  }

  const top = eligible.slice(0, 3);

  const order = top.length >= 3
    ? [top[1], top[0], top[2]]
    : top;

  const classes = top.length >= 3
    ? ["second", "first", "third"]
    : top.length === 2
      ? ["second", "first"]
      : ["first"];

  const medals = {
    1: "♛",
    2: "Ⅱ",
    3: "Ⅲ"
  };

  const labels = {
    1: "1ST PLACE",
    2: "2ND PLACE",
    3: "3RD PLACE"
  };

  podium.innerHTML = order.map((row, index) => `
    <article class="podium-card ${classes[index]}">
      <div class="podium-medal">
        ${medals[row.rank] || row.rank}
      </div>

      <div class="podium-place">
        ${labels[row.rank] || `${row.rank}TH PLACE`}
        ${row.tied ? " · TIE" : ""}
      </div>

      <div class="podium-name">
        ${escapeHTML(row.name)}
      </div>

      <div class="podium-represent">
        #${row.number} · ${escapeHTML(row.represent)}
      </div>

      <div class="podium-score">
        ${fmt(row.total)}
      </div>

      <div class="podium-note">
        ${row.tied ? "Tie — follow committee rule" : "Eligible result"}
      </div>
    </article>
  `).join("");
}

// --------------------------------------------------
// FINAL RESULTS
// --------------------------------------------------

function renderFinalResults() {
  const completion = getCompletion();
  const status = $("results-status");

  const setupValid =
    isWeightValid() &&
    data.contestants.length > 0 &&
    data.judges.length > 0 &&
    data.criteria.length > 0;

  status.className = "notice compact";

  status.innerHTML = setupValid && completion.complete
    ? `
      <span>✓</span>
      <div>
        <strong>All required scores are complete</strong>
        <p>
          All ${completion.expected} score entries are present and
          weights total 100%. Review ties and the committee's
          approved rules before confirming the official result.
        </p>
      </div>
    `
    : `
      <span>ⓘ</span>
      <div>
        <strong>Results are provisional</strong>
        <p>
          ${completion.actual} of ${completion.expected} score entries
          are present.
          ${!isWeightValid()
            ? `Criteria weights currently total ${fmt(totalWeight())}%, not 100%. `
            : ""}
          Only contestants with every judge score for every criterion
          and valid weights are eligible for the podium.
        </p>
      </div>
    `;

  renderPodium();

  const rows = getRankings().map(row => [
    row.eligible
      ? `<span class="rank-number">${row.rank}</span>${row.tied ? '<span class="rank-tie">TIE</span>' : ""}`
      : "—",

    `#${row.number}`,
    `<strong>${escapeHTML(row.name)}</strong>`,
    escapeHTML(row.represent),
    fmt(row.total),
    `${row.completedCriteria}/${row.totalCriteria}`,

    row.eligible
      ? '<span class="badge good">Eligible</span>'
      : '<span class="badge warn">Provisional</span>'
  ]);

  $("final-results").innerHTML = tableHTML(
    [
      "Rank",
      "Number",
      "Contestant",
      "Representing",
      "Weighted total",
      "Criteria complete",
      "Status"
    ],
    rows,
    "No contestants have been registered."
  );
}

// --------------------------------------------------
// EXPORT RESULTS TO CSV
// --------------------------------------------------

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCSV() {
  const header = [
    "Rank",
    "Contestant Number",
    "Contestant Name",
    "Representation",
    "Weighted Total",
    "Criteria Complete",
    "Total Criteria",
    "Eligible",
    "Tie"
  ];

  const rows = getRankings().map(row => [
    row.eligible ? row.rank : "Provisional",
    row.number,
    row.name,
    row.represent,
    fmt(row.total),
    row.completedCriteria,
    row.totalCriteria,
    row.eligible ? "Yes" : "No",
    row.tied ? "Yes" : "No"
  ]);

  const csv = [header, ...rows]
    .map(row => row.map(csvCell).join(","))
    .join("\r\n");

  downloadBlob(
    "\uFEFF" + csv,
    "text/csv;charset=utf-8;",
    "grand-pageant-results.csv"
  );

  showToast("CSV results exported.");
}

// --------------------------------------------------
// BACKUP AND RESTORE
// --------------------------------------------------

function backupData() {
  const backup = {
    ...data,
    exportedAt: new Date().toISOString(),
    appName: "Grand Pageant Tabulation System"
  };

  downloadBlob(
    JSON.stringify(backup, null, 2),
    "application/json",
    "grand-pageant-backup.json"
  );

  showToast("JSON backup downloaded.");
}

async function restoreData(file) {
  try {
    const restored = JSON.parse(await file.text());

    validateData(restored);

    if (!confirm(
      "Restore this backup? It will replace the current data in this browser."
    )) {
      return;
    }

    data = {
      schemaVersion: 2,
      eventName: restored.eventName,
      contestants: restored.contestants,
      judges: restored.judges,
      criteria: restored.criteria,
      scores: restored.scores
    };

    if (persistData()) {
      showToast("Backup restored successfully.");
    }
  } catch (error) {
    console.error("Backup restore failed:", error);

    showToast(
      "Invalid backup file. Current data was not changed.",
      true
    );
  } finally {
    $("restore-file").value = "";
  }
}

// --------------------------------------------------
// BUTTON EVENTS
// --------------------------------------------------

$("export-results").addEventListener("click", exportCSV);
$("tool-export-csv").addEventListener("click", exportCSV);
$("tool-backup").addEventListener("click", backupData);

$("tool-restore").addEventListener("click", () => {
  $("restore-file").click();
});

$("restore-file").addEventListener("change", event => {
  const file = event.target.files && event.target.files[0];

  if (file) {
    restoreData(file);
  }
});

$("print-results").addEventListener("click", () => {
  showPage("results");
  window.print();
});

$("reset-demo").addEventListener("click", () => {
  if (!confirm(
    "Reset all records to the sample demo data? Download a backup first if you need your current records."
  )) {
    return;
  }

  data = clone(DEFAULT_DATA);
  resetContestantForm();

  if (persistData()) {
    showToast("Sample demo data restored.");
  }
});

// --------------------------------------------------
// RENDER THE COMPLETE SYSTEM
// --------------------------------------------------

function renderAll() {
  renderDashboard();
  renderContestants();
  renderJudges();
  renderCriteria();
  updateSelectOptions();
  renderScores();
  renderFinalResults();
}

renderAll();
showPage("dashboard");