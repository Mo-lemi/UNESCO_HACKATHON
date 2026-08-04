// ============================================================
// QHAPHELA — full-page safety report
// ============================================================
// Opened from the in-page panel's "View full report" button. Renders the
// stored result for the tab that was scanned, so it never re-scores and can
// never disagree with what the panel showed.
//
// Honesty rules carried over from the panel and not to be relaxed:
//   - Every number shown is computed by the backend. Nothing is mocked.
//   - "Similar jobs" are real postings scanned on the same page, with real
//     URLs and real scores. No invented companies or match percentages.
//   - Threat-intel "previously reported" counts are labelled as local to
//     this device, because there is no shared reporting network.
//   - Contact checks are never called "verified" -- no registry is queried.
// ============================================================

const API_BASE = "http://127.0.0.1:8000";

const I18N = {
  en: { label: "English", overview: "Overview", redflags: "Red Flags", highlights: "Highlights",
        reasoning: "AI Reasoning", cv: "CV & Application", similar: "Similar Jobs", tracker: "My Applications" },
  zu: { label: "isiZulu", overview: "Uhlolojikelele", redflags: "Izimpawu ezibomvu", highlights: "Okugqanyisiwe",
        reasoning: "Ukucabanga kwe-AI", cv: "I-CV nesicelo", similar: "Imisebenzi efanayo", tracker: "Izicelo zami" },
  xh: { label: "isiXhosa", overview: "Isishwankathelo", redflags: "Imiqondiso ebomvu", highlights: "Okuqaqambisiweyo",
        reasoning: "Ingqiqo ye-AI", cv: "I-CV nesicelo", similar: "Imisebenzi efanayo", tracker: "Izicelo zam" },
  st: { label: "Sesotho", overview: "Kakaretso", redflags: "Matshwao a kotsi", highlights: "Se totobetseng",
        reasoning: "Monahano oa AI", cv: "CV le kopo", similar: "Mesebetsi e tshwanang", tracker: "Dikopo tsa ka" },
};
let lang = "en";

const esc = (s) => {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
};

const TIER_SYMBOL = { HIGH: "✖", MEDIUM: "!", LOW: "✓" };
const TIER_CLASS = { HIGH: "high", MEDIUM: "medium", LOW: "low" };

let state = { result: null, posting: "", jobs: [], meta: null, cvMatch: null };

// ---- Data loading ------------------------------------------------------
// Reads what the content script already stored for the scanned tab. Falls
// back to a clear empty state rather than inventing a sample result.
async function load() {
  const stored = await chrome.storage.session.get(null);
  let newest = null;
  for (const [key, val] of Object.entries(stored)) {
    if (!key.startsWith("tab-") || !val || !val.result) continue;
    if (!newest || (val.scoredAt || 0) > (newest.scoredAt || 0)) newest = val;
  }
  const local = await chrome.storage.local.get(["qhaphela-lang", "qhaphela-theme", "qhaphela-analysis"]);
  if (local["qhaphela-lang"] && I18N[local["qhaphela-lang"]]) lang = local["qhaphela-lang"];
  if (local["qhaphela-theme"] === "dark") {
    document.body.classList.add("dark");
    document.getElementById("btn-theme").textContent = "☀";
  }
  const extra = local["qhaphela-analysis"] || {};
  if (newest) {
    state.result = newest.result;
    state.meta = newest.meta || null;
  }
  state.posting = extra.posting || "";
  state.jobs = Array.isArray(extra.jobs) ? extra.jobs : [];
}

// ---- Panels ------------------------------------------------------------

function overviewPanel(r) {
  const cls = TIER_CLASS[r.tier];
  const sym = TIER_SYMBOL[r.tier] || "";
  const positives = r.positive_signals || [];
  const idSignals = r.identity_theft_signals || [];

  const summary =
    r.tier === "HIGH"
      ? "This posting shows several patterns commonly used in South African recruitment fraud."
      : r.tier === "MEDIUM"
      ? "Some signals in this posting are unclear. Verify the employer before sharing anything."
      : "This posting appears legitimate based on our analysis.";

  const verdictWord = r.tier === "HIGH" ? "TREAT WITH CAUTION" : r.tier === "MEDIUM" ? "UNCLEAR" : "SAFE";
  const verdictBody =
    r.tier === "HIGH"
      ? "Do not send your ID, banking details, or any money. Verify the company independently first."
      : r.tier === "MEDIUM"
      ? "Verify the company registration and never pay to apply."
      : "Proceed with normal caution. Verify the company and recruiter before sharing personal information.";

  const quick = positives.length
    ? `<ul class="checks ok">${positives.map((p) => `<li>${esc(p.reason)}</li>`).join("")}</ul>`
    : `<p class="muted">No independent safety signals found in this posting.</p>`;

  return `
  <div class="grid two">
    <div class="card">
      <h2>Risk overview</h2>
      <div class="dial-wrap">
        <div class="dial ${cls}-dial" style="--pct:${r.score}">
          <div class="dial-inner">
            <div class="dial-score ${cls}">${r.score}</div>
            <div class="dial-max">/100</div>
          </div>
        </div>
        <div style="flex:1;min-width:200px">
          <p class="tier-word ${cls}">${sym} ${esc(r.tier)} RISK</p>
          <p class="muted" style="margin:0 0 .5rem">${esc(summary)}</p>
          ${quick}
          <p class="pill ${cls}" style="margin-top:.7rem">AI confidence: ${r.ai_confidence}%</p>
        </div>
      </div>
      <p class="note">Confidence reflects how much interpretable evidence supports this verdict, blended with the model's own certainty. It is computed, not fixed.</p>
    </div>

    <div class="card">
      <h2>Overall verdict</h2>
      <p class="tier-word ${cls}">${sym} ${esc(verdictWord)}</p>
      <p class="muted">${esc(verdictBody)}</p>
      ${
        idSignals.length
          ? `<h3 style="margin-top:.9rem;color:var(--risk)">⚠ Identity theft risk</h3>
             <p class="muted">This posting asks for information that can be used to steal your identity:</p>
             <ul class="checks bad">${idSignals.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`
          : ""
      }
      <p class="note">Qhaphela gives you an informed recommendation. It is not a final judgement — always verify independently.</p>
    </div>
  </div>

  <div class="card" style="margin-top:1rem">
    <h2>Model performance on real postings</h2>
    <div class="grid four" id="metrics-strip"><p class="muted">Loading…</p></div>
    <p class="note" id="metrics-caveat"></p>
  </div>`;
}

function redFlagsPanel(r) {
  const flags = r.red_flags || [];
  const tiles = flags
    .map(
      (f) => `
    <div class="flag ${f.detected ? "hit" : ""}">
      <p class="flag-name">${esc(f.label)}</p>
      <p class="flag-state">${f.detected ? "✖ Detected" : "✓ Not detected"}</p>
      ${f.detected && f.evidence ? `<p class="flag-ev">“${esc(f.evidence)}”</p>` : ""}
      <p class="flag-impact">${esc(f.impact)}</p>
      ${f.detected && f.recommendation ? `<p class="flag-rec">${esc(f.recommendation)}</p>` : ""}
    </div>`
    )
    .join("");

  const intel = r.threat_intel || { curated: [], local_reports: [], curated_pattern_count: 0 };
  const intelRows = (list) =>
    list
      .map(
        (i) => `<div class="intel">
          <span class="sev ${esc(i.severity)}">${esc(i.severity)}</span>
          <span><span class="intel-ind">${esc(i.indicator)}</span> — ${esc(i.category)}<br>
          <span class="intel-note">${esc(i.note)}</span></span>
        </div>`
      )
      .join("");

  return `
  <div class="card">
    <h2>Red flag detection</h2>
    <div class="grid four">${tiles || '<p class="muted">No categories returned.</p>'}</div>
  </div>

  <div class="grid two" style="margin-top:1rem">
    <div class="card">
      <h2>South African threat intelligence</h2>
      ${
        intel.curated.length
          ? intelRows(intel.curated)
          : '<p class="muted">No known scam indicators matched this posting.</p>'
      }
      <p class="note">Matched against ${intel.curated_pattern_count} documented South African recruitment-fraud indicators.</p>
    </div>
    <div class="card">
      <h2>Community reports</h2>
      ${
        intel.local_reports.length
          ? intelRows(intel.local_reports)
          : '<p class="muted">Nothing reported for this site on this device.</p>'
      }
      <p class="note">Reports are stored locally on this device. Qhaphela has no shared reporting network yet, so these are never presented as other people’s reports.</p>
    </div>
  </div>`;
}

// Highlights the exact phrases the backend matched, inside the real posting
// text. Uses index-based splicing so overlapping matches can't corrupt the
// output, and escapes every segment.
function highlightsPanel(r) {
  const text = state.posting;
  const hl = r.highlights || [];

  if (!text) {
    return `<div class="card"><h2>In-post highlights</h2>
      ${
        hl.length
          ? `<ul class="checks bad">${hl.map((h) => `<li>“${esc(h.phrase)}” — ${esc(h.reason)}</li>`).join("")}</ul>`
          : '<p class="muted">No suspicious phrases were detected in this posting.</p>'
      }
      <p class="note">The original posting text was not available to this page, so phrases are listed rather than shown in place.</p>
    </div>`;
  }

  const spans = [];
  hl.forEach((h) => {
    const i = text.toLowerCase().indexOf((h.phrase || "").toLowerCase());
    if (i !== -1 && h.phrase) spans.push({ start: i, end: i + h.phrase.length, reason: h.reason });
  });
  spans.sort((a, b) => a.start - b.start);
  const clean = [];
  let lastEnd = -1;
  for (const s of spans) {
    if (s.start >= lastEnd) { clean.push(s); lastEnd = s.end; }
  }

  let out = "", cursor = 0;
  for (const s of clean) {
    out += esc(text.slice(cursor, s.start));
    out += `<mark class="flagphrase" title="${esc(s.reason)}">${esc(text.slice(s.start, s.end))}</mark>`;
    cursor = s.end;
  }
  out += esc(text.slice(cursor));

  return `
  <div class="grid two">
    <div class="card">
      <h2>In-post highlights</h2>
      <div class="posting">${out}</div>
    </div>
    <div class="card">
      <h2>What was flagged</h2>
      ${
        hl.length
          ? `<ul class="checks bad">${hl.map((h) => `<li>“${esc(h.phrase)}” — ${esc(h.reason)}</li>`).join("")}</ul>`
          : '<p class="muted">No common scam phrases were found in this posting.</p>'
      }
      <p class="note">Each phrase is quoted verbatim from the posting so you can find it yourself.</p>
    </div>
  </div>`;
}

function reasoningPanel(r) {
  const up = (r.rule_reasons || []).map((x) => ({ ...x, dir: "up" }));
  const down = (r.positive_signals || []).map((x) => ({ ...x, dir: "down" }));
  const all = [...up, ...down];
  const max = Math.max(30, ...all.map((x) => Math.abs(x.points)));

  const rows = all
    .map(
      (x) => `<div class="bar-row">
        <span class="bar-label">${esc(x.reason)}</span>
        <span class="bar-track"><span class="bar-fill ${x.dir}" style="width:${(Math.abs(x.points) / max) * 100}%"></span></span>
        <span class="bar-val ${x.dir}">${x.points > 0 ? "+" : ""}${x.points}</span>
      </div>`
    )
    .join("");

  const checks = r.contact_checks || { positive: [], warning: [] };

  return `
  <div class="grid two">
    <div class="card">
      <h2>AI reasoning — top factors</h2>
      ${rows || '<p class="muted">No interpretable factors fired for this posting.</p>'}
      <div class="legend">
        <span><span class="dot up"></span>Increases risk</span>
        <span><span class="dot down"></span>Reduces risk</span>
      </div>
      <p class="note">These weights are fixed and disclosed in advance, so the same signal always contributes the same amount. Shown alongside the model's own score, not as a decomposition of it.</p>
    </div>
    <div class="card">
      <h2>Contact &amp; domain checks</h2>
      ${checks.positive.length ? `<ul class="checks ok">${checks.positive.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      ${checks.warning.length ? `<ul class="checks warn">${checks.warning.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      ${!checks.positive.length && !checks.warning.length ? '<p class="muted">No contact details found in this posting.</p>' : ""}
      <p class="note">Based on the posting text only. This is <strong>not</strong> a company registry check — no CIPC or LinkedIn lookup is performed.</p>
    </div>
  </div>`;
}

function cvPanel(r) {
  const g = r.cv_guidance || { tailored: [], general: [] };
  const m = state.cvMatch;

  const matchCard = m
    ? (() => {
        const pct = m.match_percent;
        const cls = pct >= 70 ? "low" : pct >= 40 ? "medium" : "high";
        return `<div class="dial-wrap">
            <div class="dial ${cls}-dial" style="--pct:${pct}">
              <div class="dial-inner"><div class="dial-score ${cls}">${pct}%</div><div class="dial-max">match</div></div>
            </div>
            <div style="flex:1;min-width:200px">
              ${m.matched.length ? `<h3>You have</h3><ul class="checks ok">${m.matched.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
              ${m.missing.length ? `<h3 style="margin-top:.6rem">Missing from your CV</h3><ul class="checks warn">${m.missing.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
              ${(m.learning || []).length ? `<h3 style="margin-top:.7rem">Free ways to close the gap</h3>
                 <ul class="checks ok">${m.learning.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a> <span class="muted">— ${esc(l.skill)}</span></li>`).join("")}</ul>` : ""}
            </div>
          </div>
          <p class="note">${esc(m.note)}</p>`;
      })()
    : `<label class="drop" for="cv-file">
         <strong>Upload your CV</strong><br>
         <span class="muted">Plain text (.txt). Compared on your machine and never stored.</span>
       </label>
       <input id="cv-file" type="file" accept=".txt,.md,text/plain" class="hidden">`;

  return `
  <div class="grid two">
    <div class="card">
      <h2>CV match for this job</h2>
      ${matchCard}
    </div>
    <div class="card">
      <h2>${g.tailored.length ? "CV tips for this job" : "CV tips"}</h2>
      ${g.tailored.length ? `<ul class="checks ok">${g.tailored.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <ul class="checks ok">${(g.general || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <p class="note">Tailored tips are drawn from the requirements this posting actually states.</p>
    </div>
  </div>

  <div class="card" style="margin-top:1rem">
    <h2>Before you apply — safety checklist</h2>
    <ul class="checks ok">
      <li>Search the company name plus the word "scam" before responding</li>
      <li>Check the company has a website that is not just a social media page</li>
      <li>Never pay a fee, deposit, or "starter pack" charge to be considered</li>
      <li>Do not send your ID, passport, tax number or bank details before a real interview</li>
      <li>Apply through the company's official careers page where one exists</li>
    </ul>
  </div>`;
}

function similarPanel() {
  const safe = (state.jobs || [])
    .filter((j) => j.result && j.result.tier === "LOW" && j.url)
    .sort((a, b) => a.result.score - b.result.score);

  if (!safe.length) {
    return `<div class="card">
      <h2>Similar legitimate opportunities</h2>
      <p class="muted">No low-risk postings were scanned on that page.</p>
      <p class="note">Qhaphela only offers alternatives it has actually scanned and scored on the page you were viewing. It does not pull in listings from elsewhere, because it cannot verify those.</p>
      <a class="btn primary block" style="margin-top:.8rem" href="https://www.indeed.co.za" target="_blank" rel="noopener">Search Indeed South Africa ↗</a>
    </div>`;
  }

  const rows = safe
    .map(
      (j) => `<div class="job">
        <span class="job-badge">${esc((j.title || "?").trim().charAt(0).toUpperCase())}</span>
        <span class="job-main">
          <span class="job-title">${esc(j.title)}</span>
          <span class="job-meta">${esc(j.company || "On the page you scanned")}</span>
        </span>
        <span class="job-side">
          <span class="score-chip">${j.result.score}/100 low risk</span>
          <a class="btn" href="${esc(j.url)}" target="_blank" rel="noopener">Open job ↗</a>
        </span>
      </div>`
    )
    .join("");

  return `<div class="card">
    <h2>Similar legitimate opportunities — ${safe.length} found</h2>
    ${rows}
    <p class="note">These are real postings from the page you scanned, with their real links and the score our model gave each one. Nothing here is generated or estimated.</p>
  </div>`;
}

// ---- Metrics strip -----------------------------------------------------
async function loadMetrics() {
  const strip = document.getElementById("metrics-strip");
  const caveat = document.getElementById("metrics-caveat");
  if (!strip) return;
  try {
    const res = await fetch(`${API_BASE}/metrics`);
    const m = await res.json();
    strip.innerHTML = `
      <div class="stat"><div class="stat-num">${m.correct}/${m.sample_size}</div><div class="stat-lbl">correct on real postings</div></div>
      <div class="stat"><div class="stat-num low">${m.scams_caught}/${m.scams_caught + m.scams_missed}</div><div class="stat-lbl">scams caught</div></div>
      <div class="stat"><div class="stat-num">${m.false_alarms}</div><div class="stat-lbl">false alarms</div></div>
      <div class="stat"><div class="stat-num">${m.genuine}+${m.fraudulent}</div><div class="stat-lbl">genuine + fraudulent tested</div></div>`;
    caveat.textContent = m.caveat;
  } catch {
    strip.innerHTML = '<p class="muted">Model service unreachable — start it on port 8000 to see evaluation figures.</p>';
  }
}

// ---- Wiring ------------------------------------------------------------

// ---- Application tracker (module 8) ------------------------------------
// Stored in chrome.storage.local: no account, no server, no personal data
// leaves the machine. Statuses mirror a real application pipeline so the
// tool is something a job seeker returns to, not a one-shot scan.
const TRACK_STATUSES = ["Saved", "Applied", "Interview", "Offer", "Rejected"];

async function getTracked() {
  const d = await chrome.storage.local.get(["qhaphela-tracked"]);
  return Array.isArray(d["qhaphela-tracked"]) ? d["qhaphela-tracked"] : [];
}
async function setTracked(list) {
  await chrome.storage.local.set({ "qhaphela-tracked": list });
}

function trackerPanel() {
  return `<div class="card" id="tracker-card"><h2>My applications</h2>
    <p class="muted">Loading…</p></div>`;
}

async function renderTracker() {
  const card = document.getElementById("tracker-card");
  if (!card) return;
  const list = await getTracked();
  const r = state.result;
  const title = (state.meta && state.meta.title) || "This posting";
  const url = (state.meta && state.meta.url) || "";
  const already = list.some((x) => x.url === url);

  const addBtn = r && url && !already
    ? `<button class="btn primary" id="track-add">+ Track this job</button>`
    : already ? `<p class="muted">This posting is already in your tracker.</p>` : "";

  const rows = list.length
    ? list.map((j, i) => `<div class="job">
        <span class="job-badge">${esc((j.title || "?").charAt(0).toUpperCase())}</span>
        <span class="job-main">
          <span class="job-title">${esc(j.title)}</span>
          <span class="job-meta">${j.score != null ? `safety ${j.score}/100 · ` : ""}${esc(j.added)}</span>
        </span>
        <span class="job-side">
          <select class="lang" data-idx="${i}" data-act="status">
            ${TRACK_STATUSES.map((s2) => `<option${s2 === j.status ? " selected" : ""}>${s2}</option>`).join("")}
          </select>
          <button class="btn" data-idx="${i}" data-act="remove">Remove</button>
        </span>
      </div>`).join("")
    : `<p class="muted">Nothing tracked yet. Scan a job and add it here to keep track of where you applied.</p>`;

  card.innerHTML = `<h2>My applications${list.length ? ` — ${list.length}` : ""}</h2>
    ${addBtn}${rows}
    <p class="note">Stored only in this browser. Qhaphela has no account system and never uploads your application history.</p>`;

  card.querySelector("#track-add")?.addEventListener("click", async () => {
    const l = await getTracked();
    l.unshift({ title, url, score: r ? r.score : null, status: "Saved",
                added: new Date().toISOString().slice(0, 10) });
    await setTracked(l);
    renderTracker();
  });
  card.querySelectorAll("[data-act=remove]").forEach((b) =>
    b.addEventListener("click", async () => {
      const l = await getTracked(); l.splice(Number(b.dataset.idx), 1);
      await setTracked(l); renderTracker();
    }));
  card.querySelectorAll("[data-act=status]").forEach((sel) =>
    sel.addEventListener("change", async () => {
      const l = await getTracked(); l[Number(sel.dataset.idx)].status = sel.value;
      await setTracked(l); renderTracker();
    }));
}

const PANELS = {
  overview: overviewPanel,
  redflags: redFlagsPanel,
  highlights: highlightsPanel,
  reasoning: reasoningPanel,
  cv: cvPanel,
  similar: () => similarPanel(),
  tracker: () => trackerPanel(),
};

function render(which) {
  const main = document.getElementById("main");
  if (!state.result) {
    main.innerHTML = `<div class="card">
      <h2>No analysis available</h2>
      <p class="muted">Open a job posting on a supported site and let Qhaphela scan it, then reopen this page.</p>
      <p class="note">This page deliberately shows nothing rather than a sample result, so what you see is always a real scan.</p>
    </div>`;
    return;
  }
  main.innerHTML = PANELS[which](state.result);
  if (which === "overview") loadMetrics();
  if (which === "cv") wireCv();
  if (which === "tracker") renderTracker();
}

function wireCv() {
  const input = document.getElementById("cv-file");
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const cvText = (await file.text()).slice(0, 20000);
    try {
      const res = await fetch(`${API_BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv_text: cvText, job_text: state.posting || "" }),
      });
      state.cvMatch = await res.json();
      render("cv");
    } catch {
      /* leave the upload prompt in place if the service is down */
    }
  });
}

function applyTabLabels() {
  const dict = I18N[lang] || I18N.en;
  document.querySelectorAll(".tab").forEach((tab) => {
    const key = tab.dataset.panel;
    if (dict[key]) tab.textContent = dict[key];
  });
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("is-active", x === tab));
  render(tab.dataset.panel);
});

document.getElementById("btn-theme").addEventListener("click", () => {
  const dark = document.body.classList.toggle("dark");
  document.getElementById("btn-theme").textContent = dark ? "☀" : "☾";
  chrome.storage.local.set({ "qhaphela-theme": dark ? "dark" : "light" });
});

document.getElementById("btn-back").addEventListener("click", () => window.close());

const langSel = document.getElementById("lang");
langSel.innerHTML = Object.entries(I18N).map(([c, v]) => `<option value="${c}">${v.label}</option>`).join("");
langSel.addEventListener("change", () => {
  lang = langSel.value;
  chrome.storage.local.set({ "qhaphela-lang": lang });
  applyTabLabels();
});

load().then(() => {
  langSel.value = lang;
  applyTabLabels();
  document.getElementById("loading")?.remove();
  render("overview");
});
