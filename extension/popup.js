// Popup script for the Qhaphela toolbar icon.
// Renders whatever content.js already scored for the active tab (see
// loadForActiveTab below), plus a manual "scan text" box for pages the
// content script doesn't run on, or text forwarded via WhatsApp.

const TIER_CLASS = { HIGH: "high", MEDIUM: "medium", LOW: "low" };

// The API returns internal names (hard_floor_flags strings, rule/TF-IDF
// feature identifiers). These maps translate them into the short,
// lowercase labels the popup actually displays.

const FLAG_LABELS = {
  "Requests ID number/document or banking details": "id/banking request",
  "Requests an upfront payment or registration fee": "upfront payment",
};

function show(id) {
  ["view-loading", "view-empty", "view-result"].forEach((v) => {
    document.getElementById(v).classList.toggle("hidden", v !== id);
  });
}

function renderResult(result) {
  show("view-result");
  document.getElementById("details-body").classList.add("hidden");
  document.getElementById("btn-learn").textContent = "+ click for more";
  const cls = TIER_CLASS[result.tier] || "";

  const scoreEl = document.getElementById("risk-score");
  scoreEl.textContent = result.score;
  scoreEl.className = `score ${cls}`;

  const tierEl = document.getElementById("risk-tier");
  const floored = (result.hard_floor_flags || []).length > 0;
  tierEl.className = `tier ${cls}`;
  tierEl.textContent = result.tier.toLowerCase() + (floored ? " · rule floor" : "");

  const barEl = document.getElementById("risk-bar-fill");
  barEl.style.width = `${result.score}%`;
  barEl.style.background = `var(--${cls === "high" ? "crimson" : cls === "medium" ? "amber" : "teal"})`;

  const flagLine = document.getElementById("flag-line");
  flagLine.innerHTML = "";
  (result.hard_floor_flags || []).forEach((flag) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = FLAG_LABELS[flag] || flag;
    flagLine.appendChild(span);
  });

  // Itemized, disclosed point breakdown -- fixed weights per signal (see
  // features.RULE_POINT_WEIGHTS on the backend), not the raw ML/SHAP
  // breakdown, which is often just generic recruiting vocabulary with no
  // meaning to a non-technical reader. A second, transparent lens shown
  // alongside the AI score, not a decomposition of its own opaque math.
  const whyEl = document.getElementById("shap-rows");
  const whyLabelEl = document.getElementById("why-label");
  whyEl.innerHTML = "";
  const ruleReasons = result.rule_reasons || [];
  whyLabelEl.textContent = ruleReasons.length
    ? `why - ${result.rule_points_total}/100 from disclosed risk factors`
    : "why";
  if (ruleReasons.length === 0) {
    whyEl.innerHTML = '<p class="muted dim">No specific red flags found in the text.</p>';
  }
  ruleReasons.forEach((r) => {
    const row = document.createElement("div");
    row.className = "why-row";
    row.innerHTML = `<span class="reason">${r.reason}</span><span class="points">+${r.points}</span>`;
    whyEl.appendChild(row);
  });

  // Identity-theft warning: its own banner, since the harm is different in
  // kind from "this job isn't real" and stays actionable either way.
  const idWarnEl = document.getElementById("id-warning");
  const idItemsEl = document.getElementById("id-items");
  const idSignals = result.identity_theft_signals || [];
  idItemsEl.innerHTML = "";
  idWarnEl.classList.toggle("hidden", idSignals.length === 0);
  idSignals.forEach((s) => {
    const row = document.createElement("div");
    row.className = "id-item";
    row.textContent = s;
    idItemsEl.appendChild(row);
  });

  const adviceEl = document.getElementById("advice-text");
  if (result.tier === "HIGH") {
    adviceEl.textContent = "Legitimate South African employers never request ID copies or banking details before an interview. Verify the company independently before responding.";
  } else if (result.tier === "MEDIUM") {
    adviceEl.textContent = "Some signals are unclear. Verify the company's registration and never pay to apply before treating this as safe.";
  } else {
    adviceEl.textContent = "No major red flags found. Standard advice still applies: never pay to apply, never send banking details before an interview.";
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Reads whatever background.js already stored for this tab -- it never
// triggers a fresh scan itself, since content.js already scans on page
// load/mutation. This keeps popup open snappy instead of re-scoring on
// every click.
async function loadForActiveTab() {
  show("view-loading");
  const tab = await getActiveTab();
  if (!tab) return show("view-empty");
  chrome.runtime.sendMessage({ type: "QHAPHELA_GET_TAB_RESULT", tabId: tab.id }, (resp) => {
    if (chrome.runtime.lastError) return show("view-empty");
    if (resp && resp.ok && resp.data) {
      renderResult(resp.data.result);
    } else {
      show("view-empty");
    }
  });
}

async function checkApiHealth() {
  const dot = document.getElementById("api-dot");
  const label = document.getElementById("api-label");
  try {
    const res = await fetch("http://127.0.0.1:8000/health");
    const data = await res.json();
    dot.className = "dot ok";
    label.textContent = data.model_name || "online";
  } catch (e) {
    dot.className = "dot down";
    label.textContent = "api offline";
  }
}

document.getElementById("scan-toggle").addEventListener("click", () => {
  const body = document.getElementById("scan-body");
  const willShow = body.classList.contains("hidden");
  body.classList.toggle("hidden");
  document.getElementById("scan-toggle").textContent = willShow ? "− scan text" : "+ scan text";
  if (willShow) document.getElementById("paste-input").focus();
});

document.getElementById("btn-scan-paste").addEventListener("click", () => {
  const text = document.getElementById("paste-input").value.trim();
  if (!text) return;
  show("view-loading");
  chrome.runtime.sendMessage({ type: "QHAPHELA_SCAN_TEXT", text }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.ok) {
      // Distinguish "nothing to show" from "the check failed" -- telling
      // someone no posting was found when the service is simply down would
      // be a quietly wrong answer in a tool people rely on.
      show("view-empty");
      const dot = document.getElementById("api-dot");
      const label = document.getElementById("api-label");
      if (dot && label) { dot.className = "dot down"; label.textContent = "api offline"; }
      return;
    }
    renderResult(resp.result);
  });
});

document.getElementById("btn-academy").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("academy.html") });
});

// Expand/collapse the itemised breakdown. The button is declared in
// popup.html, so this listener is what keeps it from being dead UI.
document.getElementById("btn-learn").addEventListener("click", (e) => {
  const details = document.getElementById("details-body");
  const nowHidden = details.classList.toggle("hidden");
  e.target.textContent = nowHidden ? "+ click for more" : "\u2212 less detail";
  e.target.setAttribute("aria-expanded", String(!nowHidden));
});


// Hackathon MVP: this is a local-only acknowledgement, not yet wired to a
// backend feedback endpoint. The roadmap's retraining loop depends on a
// real reviewed-submission queue -- see the design docs -- which is future
// work, not something to fake here.
document.getElementById("btn-report").addEventListener("click", (e) => {
  e.target.textContent = "noted";
  e.target.disabled = true;
});

// Theme shared with the in-page panel via chrome.storage.local, so
// switching it in either surface applies to both. Adapts natively to OS theme unless overridden.
chrome.storage.local.get(["qhaphela-theme"]).then((data) => {
  const toggle = document.getElementById("theme-toggle");
  if (data["qhaphela-theme"] === "light") {
    document.body.classList.add("light");
    toggle.textContent = "☀";
  } else if (data["qhaphela-theme"] === "dark") {
    document.body.classList.add("dark");
    toggle.textContent = "☾";
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    toggle.textContent = prefersDark ? "☾" : "☀";
  }
});
document.getElementById("theme-toggle").addEventListener("click", () => {
  const isLight = document.body.classList.contains("light") || 
                 (!document.body.classList.contains("dark") && !window.matchMedia("(prefers-color-scheme: dark)").matches);
  
  document.body.classList.remove("light", "dark");
  document.body.classList.add(isLight ? "dark" : "light");
  document.getElementById("theme-toggle").textContent = isLight ? "☾" : "☀";
  chrome.storage.local.set({ "qhaphela-theme": isLight ? "dark" : "light" });
});

// New Refresh Mechanism
const refreshBtn = document.getElementById("refresh-analysis-btn");
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    refreshBtn.classList.add("loading");
    show("view-loading");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: "FORCE_REFRESH" }, () => {
        setTimeout(() => {
          refreshBtn.classList.remove("loading");
          loadForActiveTab();
        }, 1200); 
      });
    });
  });
}


checkApiHealth();
loadForActiveTab();