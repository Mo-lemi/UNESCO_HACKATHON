// ============================================================
// QHAPHELA - full-page safety report
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

// Only http(s) URLs may ever reach an href. esc() alone is insufficient:
// it prevents breaking out of the attribute, but `javascript:` needs no
// escaping to run. Job URLs here originate from scanned pages.
const safeUrl = (raw) => {
  // An empty link should render as no link, not as the current page.
  if (!raw) return "";
  try {
    const u = new URL(String(raw || ""), location.href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return esc(u.href);
  } catch {
    return "";
  }
};


const TIER_SYMBOL = { HIGH: "✖", MEDIUM: "!", LOW: "✓" };
const TIER_CLASS = { HIGH: "high", MEDIUM: "medium", LOW: "low" };

let state = { result: null, posting: "", jobs: [], meta: null, cvMatch: null, cvText: "" };

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
      <p class="note">Qhaphela gives you an informed recommendation. It is not a final judgement - always verify independently.</p>
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
          <span><span class="intel-ind">${esc(i.indicator)}</span> - ${esc(i.category)}<br>
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
// Shows each flagged phrase as its own evidence card with the surrounding
// sentence, what category it belongs to, and what to do about it.
//
// It deliberately does NOT print the whole page. Extraction falls back to
// full-page text on listing-style layouts, which previously dumped the
// entire sidebar and job list here and made the tab unreadable.
const PHRASE_CATEGORY = [
  [/registration fee|processing fee|admin fee|starter pack|deposit|training fee|courier fee/i,
   "Recruitment fee scam",
   "Legitimate South African employers never charge applicants. Any fee before employment is the scam itself."],
  [/id (number|document|copy)|certified copy|identity document|passport/i,
   "Identity document harvesting",
   "Your ID or passport is enough to open accounts and take out credit in your name."],
  [/bank(ing)? (account|details)|account number|bank confirmation/i,
   "Banking detail harvesting",
   "Banking details are only needed after you have signed a contract, never to apply."],
  [/proof of residence|utility bill|municipal bill/i,
   "Excess document collection",
   "Proof of residence is not needed to consider an application. It completes an identity-theft profile."],
  [/tax (number|certificate)|sars|irp5/i,
   "Tax document harvesting",
   "Tax numbers enable fraudulent claims and account openings in your name."],
  [/whatsapp|0[6-8]\d[\s-]?\d{3}[\s-]?\d{4}/i,
   "Off-platform migration",
   "Moving off the platform removes the record and makes the recruiter untraceable."],
  [/urgent|act fast|limited (spaces|spots)|today only|closes tonight|immediately/i,
   "Artificial urgency",
   "Pressure exists to stop you checking. A real employer will wait while you verify them."],
  [/popia/i,
   "Misused legal clause",
   "POPIA is quoted to sound official. Real POPIA compliance protects you; it never justifies demanding your ID."],
  [/@(gmail|yahoo|outlook|hotmail)\.com/i,
   "Free email recruiter",
   "Worth questioning, though some small genuine businesses do use free email."],
  [/b-?bbee/i,
   "Unverifiable compliance claim",
   "A B-BBEE claim with no certificate number cannot be checked."],
];

function categoriseTail(phrase) {
  for (const [re, cat, why] of PHRASE_CATEGORY) {
    if (re.test(phrase)) return { cat, why };
  }
  return { cat: "Suspicious wording", why: "This phrasing matches patterns seen in fraudulent postings." };
}

// Pulls the sentence containing the phrase so the quote has context, without
// dragging in the rest of the page.
function contextFor(text, phrase) {
  if (!text || !phrase) return "";
  const i = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (i === -1) return "";
  const before = text.lastIndexOf(".", i);
  const after = text.indexOf(".", i + phrase.length);
  const start = Math.max(before === -1 ? i - 90 : before + 1, 0);
  const end = Math.min(after === -1 ? i + phrase.length + 90 : after + 1, text.length);
  return text.slice(start, end).trim();
}

function highlightsPanel(r) {
  const hl = r.highlights || [];
  const text = state.posting || "";

  if (!hl.length) {
    // Nothing found: report what was actually checked, so "all clear" is
    // evidence rather than an empty screen.
    const checked = (r.red_flags || []).map((f) => f.label);
    return `
    <div class="grid two">
      <div class="card">
        <h2>In-post phrase scan</h2>
        <p class="tier-word low">✓ No scam phrasing found</p>
        <p class="muted">Every sentence in this posting was checked against known South African
        recruitment-fraud wording. None of it matched.</p>
        <h3 style="margin-top:.9rem">What was checked</h3>
        <ul class="checks ok">${checked.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      </div>
      <div class="card">
        <h2>What this does and does not mean</h2>
        <ul class="checks ok"><li>No fee, document or off-platform request was worded in this posting.</li></ul>
        <ul class="checks warn">
          <li>Wording alone is not proof of legitimacy - a careful scammer avoids obvious phrases.</li>
          <li>Requests often come <em>later</em>, by email or WhatsApp, after you apply.</li>
        </ul>
        <h3 style="margin-top:.9rem">Stay alert for</h3>
        <ul class="checks warn">
          <li>Any fee, deposit or "starter pack" charge introduced after contact</li>
          <li>A request for your ID, passport or bank details before a real interview</li>
          <li>A move to WhatsApp or a personal email address</li>
        </ul>
      </div>
    </div>`;
  }

  const cards = hl
    .map((h) => {
      const { cat, why } = categoriseTail(h.phrase || "");
      const ctx = contextFor(text, h.phrase);
      const marked = ctx
        ? esc(ctx).replace(
            new RegExp(esc(h.phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
            (m) => `<mark class="flagphrase">${m}</mark>`
          )
        : "";
      return `<div class="evidence">
        <div class="evidence-head">
          <span class="sev High">${esc(cat)}</span>
          <span class="evidence-phrase">“${esc(h.phrase)}”</span>
        </div>
        ${ctx ? `<p class="evidence-ctx">…${marked}…</p>` : ""}
        <p class="evidence-why"><strong>Why this matters:</strong> ${esc(why)}</p>
        <p class="evidence-flag"><strong>Flagged as:</strong> ${esc(h.reason)}</p>
      </div>`;
    })
    .join("");

  return `
  <div class="card">
    <h2>Suspicious phrases found - ${hl.length}</h2>
    <p class="muted">Each phrase below is quoted verbatim from the posting, with the sentence it
    appeared in, so you can find and judge it yourself.</p>
    ${cards}
  </div>

  <div class="card" style="margin-top:1rem">
    <h2>What to do now</h2>
    <ul class="checks warn">
      <li>Do not reply with any personal document until you have verified the employer independently</li>
      <li>Search the company name plus "scam" before responding</li>
      <li>If money is requested at any point, stop - that is the scam, not a step in it</li>
      <li>Report the posting to the platform, and to Qhaphela using the panel</li>
    </ul>
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
      <h2>AI reasoning - top factors</h2>
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
      <p class="note">Based on the posting text only. This is <strong>not</strong> a company registry check - no CIPC or LinkedIn lookup is performed.</p>
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
                 <ul class="checks ok">${m.learning.map((l) => `<li><a href="${safeUrl(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a> <span class="muted">- ${esc(l.skill)}</span></li>`).join("")}</ul>` : ""}
            </div>
          </div>
          <p class="note">${esc(m.note)}</p>`;
      })()
    : `<label class="drop" for="cv-file">
         <strong>Upload your CV</strong><br>
         <span class="muted">PDF, Word (.docx), .txt or .md - up to 5 MB.</span><br>
         <span class="muted">Read on your own machine and never stored or uploaded anywhere.</span>
       </label>
       <input id="cv-file" type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" class="hidden">
       <p class="cv-error hidden" id="cv-error"></p>`;

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
    <h2>Before you apply - safety checklist</h2>
    <ul class="checks ok">
      <li>Search the company name plus the word "scam" before responding</li>
      <li>Check the company has a website that is not just a social media page</li>
      <li>Never pay a fee, deposit, or "starter pack" charge to be considered</li>
      <li>Do not send your ID, passport, tax number or bank details before a real interview</li>
      <li>Apply through the company's official careers page where one exists</li>
    </ul>
  </div>`;
}

// Real search URLs across South African job platforms, seeded with the role
// currently being viewed. These are genuine searches the user can run -- not
// claimed results. Every format was verified against the live site.
const JOB_PLATFORMS = [
  ["Indeed South Africa", (q) => `https://za.indeed.com/jobs?q=${encodeURIComponent(q)}`],
  ["PNet",                (q) => `https://www.pnet.co.za/jobs?q=${encodeURIComponent(q)}`],
  ["Careers24",           (q) => `https://www.careers24.com/jobs/kw-${encodeURIComponent(q.replace(/\s+/g, "-"))}/`],
  ["CareerJunction",      (q) => `https://www.careerjunction.co.za/jobs/results?keywords=${encodeURIComponent(q)}`],
  ["Jobsora SA",          (q) => `https://za.jobsora.com/jobs?query=${encodeURIComponent(q)}`],
  ["JobMail",             (q) => `https://www.jobmail.co.za/jobs/${encodeURIComponent(q.replace(/\s+/g, "-"))}`],
  ["Adzuna SA",           (q) => `https://www.adzuna.co.za/search?q=${encodeURIComponent(q)}`],
  ["LinkedIn Jobs",       (q) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=South%20Africa`],
  ["Glassdoor SA",        (q) => `https://www.glassdoor.co.za/Job/jobs.htm?sc.keyword=${encodeURIComponent(q)}`],
  ["Gumtree Jobs",        () => `https://www.gumtree.co.za/s-jobs/v1c8p1`],
  ["JobJack (entry level)", () => `https://www.jobjack.co.za/`],
  ["Government vacancies (DPSA)", () => `https://www.dpsa.gov.za/newsroom/psvc/`],
];

// Best-effort role keyword from the posting being viewed, so each search
// lands on something relevant rather than a bare homepage.
function roleKeyword() {
  const title = (state.meta && state.meta.title) || "";
  const cleaned = title
    // \u2013 and \u2014 are the en and em dash. Written as escapes because the
    // source keeps to plain ASCII, but they must still be MATCHED: real job
    // boards put them in page titles ("Data Analyst \u2014 Indeed").
    .replace(/\s*[-|\u2013\u2014]\s*(job|jobs|indeed|linkedin|careers?|pnet|jobsora).*/i, "")
    .replace(/\bjob post(ing)?\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 60) || "jobs";
}

function platformSearchHtml() {
  const q = roleKeyword();
  const rows = JOB_PLATFORMS.map(
    ([name, build]) => `<div class="job">
      <span class="job-badge">${esc(name.charAt(0))}</span>
      <span class="job-main">
        <span class="job-title">${esc(name)}</span>
        <span class="job-meta">Search “${esc(q)}”</span>
      </span>
      <span class="job-side">
        <a class="btn" href="${safeUrl(build(q))}" target="_blank" rel="noopener">Search ↗</a>
      </span>
    </div>`
  ).join("");

  return `<div class="card" style="margin-top:1rem">
    <h2>Search this role across every SA platform - ${JOB_PLATFORMS.length}</h2>
    <p class="muted">Live searches for <strong>${esc(q)}</strong>, pre-filled. Qhaphela will scan
    whichever results you open, so you can check any of them before applying.</p>
    ${rows}
    <p class="note">These are search links, not verified vacancies. Qhaphela only vouches for
    postings it has actually scanned and scored.</p>
  </div>`;
}

function similarPanel() {
  const safe = (state.jobs || [])
    .filter((j) => j.result && j.result.tier === "LOW" && j.url)
    .sort((a, b) => a.result.score - b.result.score);

  if (!safe.length) {
    return `<div class="card">
      <h2>Similar legitimate opportunities</h2>
      <p class="muted">No low-risk postings were scanned on the page you came from.</p>
      <p class="note">Qhaphela only vouches for postings it has actually scanned and scored. It will
      not list vacancies from elsewhere as "safe", because it cannot verify those. Use the searches
      below instead - open any result and Qhaphela will scan it for you.</p>
    </div>${platformSearchHtml()}`;
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
          <a class="btn" href="${safeUrl(j.url)}" target="_blank" rel="noopener">Open job ↗</a>
        </span>
      </div>`
    )
    .join("");

  return `<div class="card">
    <h2>Similar legitimate opportunities - ${safe.length} found</h2>
    ${rows}
    <p class="note">These are real postings from the page you scanned, with their real links and the
    score our model gave each one. Nothing here is generated or estimated.</p>
  </div>${platformSearchHtml()}`;
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
    strip.innerHTML = '<p class="muted">Model service unreachable - start it on port 8000 to see evaluation figures.</p>';
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

  card.innerHTML = `<h2>My applications${list.length ? ` - ${list.length}` : ""}</h2>
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

// ---- Qhaphela AI --------------------------------------------------------
// The extension holds no key and never calls Groq: every request goes
// through the background worker to the local service, which is the only
// place the credential exists.
let aiConfigured = null;
let chatLog = [];

function aiCall(endpoint, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "QHAPHELA_AI", endpoint, payload }, (resp) => {
      // A torn-down service worker returns undefined with lastError set.
      // Resolving to a shaped error keeps every caller on one code path
      // instead of hitting `undefined.ok` and dying silently.
      if (chrome.runtime.lastError || !resp) {
        resolve({ ok: false, error: "The Qhaphela service could not be reached. Check it is running on port 8000." });
        return;
      }
      resolve(resp);
    });
  });
}

// Model output is inserted as text, never as HTML, so nothing an LLM returns
// can execute in the page.
function renderMarkdownish(text) {
  return esc(text)
    .replace(/^### (.*)$/gm, "<strong>$1</strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\s*[-*]\s+(.*)$/gm, "• $1")
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

const AI_TOOLS = [
  ["explain",      "Explain this posting",   "Plain language, in your language",            (r) => ({ text: state.posting })],
  ["interview",    "Prepare me for interview","Likely questions and STAR answers",          (r) => ({ job_text: state.posting, company: companyName() })],
  ["cover-letter", "Write a cover letter",   "Uses only what is really in your CV",         (r) => ({ job_text: state.posting, cv_text: state.cvText, company: companyName() })],
  ["email",        "Write application email","Ready to send with your CV attached",         (r) => ({ job_text: state.posting, cv_text: state.cvText, company: companyName() })],
  ["improve-cv",   "Improve my CV",          "Stronger wording for this role",              (r) => ({ job_text: state.posting, cv_text: state.cvText })],
];

function companyName() {
  return (state.meta && state.meta.title ? state.meta.title : "").slice(0, 120);
}

function aiPanel() {
  return `
  <div class="card" id="ai-disclosure">
    <h2>Qhaphela AI</h2>
    <p class="tier-word medium">! This feature sends text to an AI service</p>
    <p class="muted">Fraud detection runs entirely on your computer. <strong>Qhaphela AI is
    different</strong> - the posting text or question you send is processed by Groq's servers
    (Llama 3.3 70B) to generate an answer. Nothing else about you is sent: no name, no CV unless
    you attach one, no browsing history.</p>
    <p class="note">Do not paste your ID number, banking details or passwords into the assistant.</p>
  </div>

  <div class="grid two" style="margin-top:1rem">
    <div class="card">
      <h2>Ask Qhaphela AI</h2>
      <p class="muted">Paste a suspicious WhatsApp message or advert, or ask anything about
      staying safe while job hunting.</p>
      <div class="chat" id="chat-log"></div>
      <div class="chat-input">
        <textarea id="chat-box" rows="3" placeholder="Paste a message, or ask a question…"></textarea>
        <button class="btn primary" id="chat-send" type="button">Ask</button>
      </div>
      <p class="note">Qhaphela AI can be wrong. It never changes the risk score - that comes from
      the model running on your machine.</p>
    </div>

    <div class="card">
      <h2>AI tools for this job</h2>
      <div id="ai-tools"></div>
      <div id="ai-output" class="ai-output hidden"></div>
    </div>
  </div>`;
}

async function wireAi() {
  const status = await new Promise((r) =>
    chrome.runtime.sendMessage({ type: "QHAPHELA_AI_STATUS" }, (resp) =>
      r(chrome.runtime.lastError || !resp ? { ok: false, configured: false } : resp)
    )
  );
  aiConfigured = status && status.configured;

  const tools = document.getElementById("ai-tools");
  const out = document.getElementById("ai-output");

  if (!aiConfigured) {
    tools.innerHTML = `<p class="muted">The AI assistant is not set up. Add <code>GROQ_API_KEY</code>
      to the <code>.env</code> file in the project root and restart the service.</p>`;
    document.getElementById("chat-send").disabled = true;
    return;
  }

  tools.innerHTML = AI_TOOLS.map(
    ([id, label, hint]) => `<div class="job">
      <span class="job-main">
        <span class="job-title">${esc(label)}</span>
        <span class="job-meta">${esc(hint)}</span>
      </span>
      <span class="job-side"><button class="btn" data-ai="${id}" type="button">Run</button></span>
    </div>`
  ).join("");

  tools.querySelectorAll("[data-ai]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const [, label, , build] = AI_TOOLS.find((t) => t[0] === btn.dataset.ai);
      const payload = { ...build(state.result), language: lang };
      if (!state.posting) {
        out.classList.remove("hidden");
        out.innerHTML = `<p class="muted">Scan a job posting first.</p>`;
        return;
      }
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = "…";
      out.classList.remove("hidden");
      out.innerHTML = `<p class="muted">Qhaphela AI is thinking…</p>`;
      const res = await aiCall(btn.dataset.ai, payload);
      btn.disabled = false;
      btn.textContent = original;
      out.innerHTML = res && res.ok
        ? `<h3>${esc(label)}</h3><div class="ai-body">${renderMarkdownish(res.answer)}</div>
           <p class="note">Generated by ${esc(res.model || "AI")}. Check it before you send anything.</p>`
        : `<p class="muted">${esc((res && res.error) || "That did not work.")}</p>`;
    })
  );

  const box = document.getElementById("chat-box");
  const send = document.getElementById("chat-send");
  const log = document.getElementById("chat-log");

  const paint = () => {
    log.innerHTML = chatLog
      .map(
        (m) => `<div class="msg ${m.role}">
          <span class="msg-who">${m.role === "user" ? "You" : "Qhaphela AI"}</span>
          <div class="msg-body">${m.role === "user" ? esc(m.content) : renderMarkdownish(m.content)}</div>
        </div>`
      )
      .join("");
    log.scrollTop = log.scrollHeight;
  };

  async function ask() {
    const question = box.value.trim();
    if (!question) return;
    chatLog.push({ role: "user", content: question });
    box.value = "";
    send.disabled = true;
    paint();
    log.insertAdjacentHTML("beforeend", `<div class="msg assistant" id="thinking"><span class="msg-who">Qhaphela AI</span><div class="msg-body">…</div></div>`);
    log.scrollTop = log.scrollHeight;

    const res = await aiCall("ask", { question, language: lang, history: chatLog.slice(0, -1) });
    document.getElementById("thinking")?.remove();
    chatLog.push({
      role: "assistant",
      content: res && res.ok ? res.answer : (res && res.error) || "That did not work.",
    });
    send.disabled = false;
    paint();
  }

  send.addEventListener("click", ask);
  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) ask();
  });
}

const PANELS = {
  overview: overviewPanel,
  redflags: redFlagsPanel,
  highlights: highlightsPanel,
  reasoning: reasoningPanel,
  cv: cvPanel,
  similar: () => similarPanel(),
  tracker: () => trackerPanel(),
  ai: () => aiPanel(),
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
  if (which === "ai") wireAi();
}

function wireCv() {
  const input = document.getElementById("cv-file");
  if (!input) return;
  const errEl = document.getElementById("cv-error");
  const showError = (msg) => {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.classList.remove("hidden");
  };

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    errEl?.classList.add("hidden");

    // Sent as a file so the local service can extract text from PDF and
    // Word documents. It runs on 127.0.0.1 -- the user's own machine -- and
    // parses in memory without writing anything to disk.
    const form = new FormData();
    form.append("cv_file", file);
    form.append("job_text", state.posting || "");
    try {
      const res = await fetch(`${API_BASE}/match-file`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        showError(data.detail || "That file could not be read.");
        return;
      }
      state.cvMatch = data;
      render("cv");
    } catch {
      showError("Cannot reach the Qhaphela service. Is it running on port 8000?");
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
