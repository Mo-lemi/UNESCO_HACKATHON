// Popup script for the Isazi toolbar icon.
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

const FEATURE_LABELS = {
  popia_clause_with_doc_request: "fake popia clause + doc request",
  bbbee_claim_no_cert: "unverifiable b-bbee claim",
  whatsapp_migration: "whatsapp migration",
  upfront_payment_request: "upfront payment language",
  id_or_banking_request: "id/banking request",
  urgency_language: "urgency / scarcity language",
  salary_mismatch_ratio: "salary/role mismatch",
  freemail_contact: "free-email contact",
  posting_length_norm: "posting length pattern",
};

function featureLabel(name) {
  return FEATURE_LABELS[name] || name;
}

function show(id) {
  ["view-loading", "view-empty", "view-result"].forEach((v) => {
    document.getElementById(v).classList.toggle("hidden", v !== id);
  });
}

function renderResult(result) {
  show("view-result");
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

  const shapEl = document.getElementById("shap-rows");
  shapEl.innerHTML = "";
  const reasons = result.top_reasons || [];
  if (reasons.length === 0) {
    shapEl.innerHTML = '<p class="muted dim">no standout signal either way</p>';
  }
  reasons.forEach((r) => {
    const positive = r.contribution >= 0;
    const row = document.createElement("div");
    row.className = "shap-row";
    row.innerHTML = `<span class="name">${featureLabel(r.feature)}</span><span class="val ${positive ? "pos" : "neg"}">${positive ? "+" : ""}${r.contribution.toFixed(3)}</span>`;
    shapEl.appendChild(row);
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
  chrome.runtime.sendMessage({ type: "ISAZI_GET_TAB_RESULT", tabId: tab.id }, (resp) => {
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
  chrome.runtime.sendMessage({ type: "ISAZI_SCAN_TEXT", text }, (resp) => {
    if (resp && resp.ok) {
      renderResult(resp.result);
    } else {
      show("view-empty");
    }
  });
});

document.getElementById("btn-academy").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("academy.html") });
});

document.getElementById("btn-learn").addEventListener("click", () => {
  document.querySelector(".why").scrollIntoView({ behavior: "smooth", block: "center" });
});

// Hackathon MVP: this is a local-only acknowledgement, not yet wired to a
// backend feedback endpoint. The roadmap's retraining loop depends on a
// real reviewed-submission queue -- see the design docs -- which is future
// work, not something to fake here.
document.getElementById("btn-report").addEventListener("click", (e) => {
  e.target.textContent = "noted";
  e.target.disabled = true;
});

checkApiHealth();
loadForActiveTab();
