// ============================================================
// QHAPHELA — content script
// ============================================================
// Runs on job platforms. Extracts the posting text, sends it to the local
// scoring service via the background worker (a content script can't call an
// http:// endpoint from an https:// page), then:
//
//   1. underlines the exact red-flag phrases inside the posting itself, and
//   2. renders the docked safety panel.
//
// Design note: the panel is DOCKED into the page layout (the host <html>
// gets a matching margin-left) rather than floating over the content, so it
// never covers the job the person is trying to read.
//
// Honesty rules that shape this file, and must not be quietly relaxed:
//   - "Safe job matches" are ONLY real postings scanned on the current page,
//     with their real URLs and real model scores. No invented listings.
//   - Report counts are labelled "on this device" because the store is local.
//   - Contact checks are never labelled "verified" -- no registry is queried.
// ============================================================

const HIGHLIGHT_CLASS = "qhaphela-flag";

// Real trusted SA job portals. Used only as a fallback when the page has no
// scannable job cards to draw genuine alternatives from.
const TRUSTED_JOB_LINKS = [
  { label: "Public Service Vacancy Circular (gov.za)", url: "https://www.dpsa.gov.za/newsroom/psvc/" },
  { label: "Indeed South Africa", url: "https://www.indeed.co.za" },
  { label: "Careers24", url: "https://www.careers24.com" },
  { label: "PNet", url: "https://www.pnet.co.za" },
  { label: "LinkedIn Jobs", url: "https://www.linkedin.com/jobs" },
];

const PANEL_FLAG_LABELS = {
  "Requests ID number/document or banking details": "id/banking request",
  "Requests an upfront payment or registration fee": "upfront payment",
  "Requests passport details": "passport request",
};

// Risk tier must never be communicated by colour alone (WCAG 1.4.1) -- red
// vs amber is precisely what red-green colourblind readers cannot separate.
const TIER_SYMBOLS = { HIGH: "✖", MEDIUM: "!", LOW: "✓" };

// ---- Translations ----------------------------------------------------
// Scope is deliberate and honest: the safety-critical strings (verdicts,
// advice, section headings, buttons) are translated. Job titles, company
// names and detected evidence stay in their original language because they
// are quoted from the posting -- translating quoted evidence would make it
// unverifiable against the page.
const I18N = {
  en: {
    label: "English",
    tagline: "Your job safety companion",
    safetyScore: "Job safety score",
    confidence: "AI confidence",
    viewAnalysis: "View full report",
    lessDetail: "Hide report",
    reportPosting: "Report this posting",
    reported: "Reported — thank you",
    submitReport: "Submit report",
    safeMatches: "Safe job matches",
    verifiedChannels: "Verified job search channels",
    cvTipsForJob: "CV tips for this job",
    cvTips: "CV tips: what gets you considered",
    whyLabel: "Why this score",
    reducesRisk: "What lowers the risk",
    redFlags: "Red flag detection",
    contactChecks: "Contact & domain checks",
    idTheftTitle: "Identity theft risk",
    safetyTip: "Digital safety tip",
    safetyTipBody: "Never share your ID, banking details, or pay recruitment fees before verifying the employer.",
    noPosting: "Open a specific job posting to get a safety score",
    scanning: "Scanning this page for a job posting…",
    offline: "Can't reach the Qhaphela model service. Is it running on port 8000?",
    noFlags: "No specific red flags found in the text.",
    notDetected: "Not detected",
    detected: "Detected",
    onThisPage: "jobs on this page",
    checkNote: "Based on the posting text only. Not a company registry check.",
    foot: "Protect yourself. Stay aware. Apply smart.",
    verdictHigh: "High risk — treat this posting with caution",
    verdictMedium: "Some signals are unclear",
    verdictLow: "No major red flags found",
    high: "Do not send your ID, banking details or any money. A real employer never asks for these before an interview.",
    medium: "Be careful. Verify the company independently and never pay to apply.",
    low: "Still never pay to apply or send banking details before an interview.",
    idTheft: "This posting asks for information that can be used to steal your identity.",
    cvMatch: "CV match for this job",
    cvMatchIntro: "Upload your CV to see how well it matches this posting's stated requirements.",
    uploadCv: "Upload CV (.txt)",
    cvPrivacy: "Your CV is compared on your own machine and is never stored or uploaded anywhere.",
    match: "match",
    youHave: "You have",
    missing: "Missing from your CV",
    quickDetail: "Quick detail",
  },
  zu: {
    label: "isiZulu",
    tagline: "Umngane wakho wokuphepha emsebenzini",
    safetyScore: "Amaphuzu okuphepha komsebenzi",
    confidence: "Ukuqiniseka kwe-AI",
    viewAnalysis: "Buka umbiko ogcwele",
    lessDetail: "Fihla umbiko",
    reportPosting: "Bika lesi sikhangiso",
    reported: "Kubikiwe — siyabonga",
    submitReport: "Thumela umbiko",
    safeMatches: "Imisebenzi ephephile",
    verifiedChannels: "Iziteshi zokusesha umsebenzi eziqinisekisiwe",
    cvTipsForJob: "Amathiphu e-CV walo msebenzi",
    cvTips: "Amathiphu e-CV: okwenza ucatshangelwe",
    whyLabel: "Kungani lawa maphuzu",
    reducesRisk: "Okwehlisa ingozi",
    redFlags: "Ukutholwa kwezimpawu ezibomvu",
    contactChecks: "Ukuhlolwa kokuxhumana nesizinda",
    idTheftTitle: "Ingozi yokwebiwa kobunikazi",
    safetyTip: "Ithiphu yokuphepha kwedijithali",
    safetyTipBody: "Ungalokothi wabelane nge-ID yakho, imininingwane yasebhange, noma ukhokhe izimali zokuqasha ngaphambi kokuqinisekisa umqashi.",
    noPosting: "Vula isikhangiso somsebenzi esithile ukuze uthole amaphuzu okuphepha",
    scanning: "Kuskenwa leli khasi kufunwa isikhangiso somsebenzi…",
    offline: "Ayikwazi ukufinyelela isevisi ye-Qhaphela. Ingabe isebenza ku-port 8000?",
    noFlags: "Azitholakalanga izimpawu ezibomvu ezithile embhalweni.",
    notDetected: "Akutholakalanga",
    detected: "Kutholakele",
    onThisPage: "imisebenzi kuleli khasi",
    checkNote: "Kusekelwe embhalweni wesikhangiso kuphela. Akuwona umhlolo wohlu lwezinkampani.",
    foot: "Zivikele. Hlala uqaphile. Faka isicelo ngokuhlakanipha.",
    verdictHigh: "Ingozi ephezulu — qaphela lesi sikhangiso",
    verdictMedium: "Ezinye izimpawu azicaci",
    verdictLow: "Azitholakalanga izimpawu ezibomvu ezinkulu",
    high: "Ungathumeli i-ID yakho, imininingwane yasebhange noma imali. Umqashi weqiniso akaze acele lokhu ngaphambi kwenhlolokhono.",
    medium: "Qaphela. Hlola inkampani ngokuzimela futhi ungakhokhi ukuze ufake isicelo.",
    low: "Noma kunjalo ungakhokhi ukuze ufake isicelo noma uthumele imininingwane yasebhange ngaphambi kwenhlolokhono.",
    idTheft: "Lesi sikhangiso sicela imininingwane engasetshenziselwa ukweba ubunikazi bakho.",
    cvMatch: "Ukufana kwe-CV nalo msebenzi",
    cvMatchIntro: "Layisha i-CV yakho ubone ukuthi ihambisana kangakanani nezidingo zalesi sikhangiso.",
    uploadCv: "Layisha i-CV (.txt)",
    cvPrivacy: "I-CV yakho iqhathaniswa emshinini wakho futhi ayigcinwa noma ilayishwe ndawo.",
    match: "ukufana",
    youHave: "Onakho",
    missing: "Okushodayo ku-CV yakho",
    quickDetail: "Imininingwane esheshayo",
  },
  xh: {
    label: "isiXhosa",
    tagline: "Umhlobo wakho wokhuseleko lomsebenzi",
    safetyScore: "Amanqaku okhuseleko lomsebenzi",
    confidence: "Ukuzithemba kwe-AI",
    viewAnalysis: "Jonga ingxelo epheleleyo",
    lessDetail: "Fihla ingxelo",
    reportPosting: "Xela esi saziso",
    reported: "Kuxeliwe — enkosi",
    submitReport: "Thumela ingxelo",
    safeMatches: "Imisebenzi ekhuselekileyo",
    verifiedChannels: "Iziteshi zokukhangela umsebenzi eziqinisekisiweyo",
    cvTipsForJob: "Iingcebiso ze-CV zalo msebenzi",
    cvTips: "Iingcebiso ze-CV: okukwenza uqwalaselwe",
    whyLabel: "Kutheni la manqaku",
    reducesRisk: "Okunciphisa umngcipheko",
    redFlags: "Ukufunyanwa kwemiqondiso ebomvu",
    contactChecks: "Ukukhangelwa koqhagamshelwano nedomeyini",
    idTheftTitle: "Umngcipheko wokubiwa kobuqu",
    safetyTip: "Ingcebiso yokhuseleko lwedijithali",
    safetyTipBody: "Ungaze wabelane nge-ID yakho, iinkcukacha zebhanki, okanye uhlawule iimali zoqeshwa phambi kokuqinisekisa umqeshi.",
    noPosting: "Vula isaziso somsebenzi esithile ukufumana amanqaku okhuseleko",
    scanning: "Kukhangelwa eli phepha isaziso somsebenzi…",
    offline: "Ayikwazi ukufikelela kwinkonzo ye-Qhaphela. Ingaba isebenza kwi-port 8000?",
    noFlags: "Akukho miqondiso ibomvu ithile ifunyenweyo kumbhalo.",
    notDetected: "Ayifunyanwanga",
    detected: "Ifunyenwe",
    onThisPage: "imisebenzi kweli phepha",
    checkNote: "Isekelwe kumbhalo wesaziso kuphela. Ayilokhangelo lwerejista yenkampani.",
    foot: "Zikhusele. Hlala uphaphile. Faka isicelo ngobulumko.",
    verdictHigh: "Umngcipheko ophezulu — lumka ngesi saziso",
    verdictMedium: "Eminye imiqondiso ayicaci",
    verdictLow: "Akukho miqondiso ibomvu mikhulu ifunyenweyo",
    high: "Sukuthumela i-ID yakho, iinkcukacha zebhanki okanye imali. Umqeshi wokwenene akaze acele ezi zinto phambi kodliwano-ndlebe.",
    medium: "Lumka. Qinisekisa inkampani ngokuzimeleyo kwaye ungahlawuli ukufaka isicelo.",
    low: "Nangona kunjalo ungahlawuli ukufaka isicelo okanye uthumele iinkcukacha zebhanki phambi kodliwano-ndlebe.",
    idTheft: "Esi saziso sicela iinkcukacha ezinokusetyenziswa ukuba ubuqu bakho.",
    cvMatch: "Ukungqamana kwe-CV nalo msebenzi",
    cvMatchIntro: "Layisha i-CV yakho ubone ukuba ingqamana kangakanani neemfuno zesi saziso.",
    uploadCv: "Layisha i-CV (.txt)",
    cvPrivacy: "I-CV yakho ithelekiswa kumatshini wakho kwaye ayigcinwa okanye ilayishwe naphi na.",
    match: "ukungqamana",
    youHave: "Onako",
    missing: "Okulahlekileyo kwi-CV yakho",
    quickDetail: "Iinkcukacha ezikhawulezayo",
  },
  st: {
    label: "Sesotho",
    tagline: "Motsoalle oa hau oa polokeho mosebetsing",
    safetyScore: "Lintlha tsa polokeho ea mosebetsi",
    confidence: "Boitshepo ba AI",
    viewAnalysis: "Sheba tlaleho e felletseng",
    lessDetail: "Pata tlaleho",
    reportPosting: "Tlaleha tsebiso ena",
    reported: "E tlalehiloe — kea leboha",
    submitReport: "Romela tlaleho",
    safeMatches: "Mesebetsi e sireletsehileng",
    verifiedChannels: "Ditsela tse netefalitsweng tsa ho batla mosebetsi",
    cvTipsForJob: "Malebela a CV bakeng sa mosebetsi ona",
    cvTips: "Malebela a CV: se etsang hore o nahanoe",
    whyLabel: "Hobaneng lintlha tsena",
    reducesRisk: "Se fokotsang kotsi",
    redFlags: "Ho fumanoa ha matshwao a kotsi",
    contactChecks: "Tlhahlobo ea boitsebiso le domain",
    idTheftTitle: "Kotsi ea bosholu ba boitsebiso",
    safetyTip: "Keletso ea polokeho ea dijithale",
    safetyTipBody: "Le ka mohla o se ke wa arolelana ID ya hao, dintlha tsa banka, kapa wa lefa ditefiso tsa ho hira pele o netefatsa mohiri.",
    noPosting: "Bula tsebiso e itseng ea mosebetsi ho fumana lintlha tsa polokeho",
    scanning: "Ho hlahlojoa leqephe lena ho batloa tsebiso ea mosebetsi…",
    offline: "Ha e khone ho fihlela tshebeletso ea Qhaphela. Na e sebetsa ho port 8000?",
    noFlags: "Ha ho matshwao a kotsi a fumanweng sengolweng.",
    notDetected: "Ha e a fumanoa",
    detected: "E fumanoe",
    onThisPage: "mesebetsi leqepheng lena",
    checkNote: "E ipapisitse le sengoloa sa tsebiso feela. Hase tlhahlobo ea rejistara ea khamphani.",
    foot: "Itshireletse. Lula o hlokolosi. Etsa kopo ka bohlale.",
    verdictHigh: "Kotsi e phahameng — hlokomela tsebiso ena",
    verdictMedium: "Matshwao a mang ha a hlake",
    verdictLow: "Ha ho matshwao a maholo a kotsi a fumanweng",
    high: "Se ke wa romela ID ya hao, dintlha tsa banka kapa chelete. Mohiri wa nnete ha a ke a kopa tsena pele ho inthavu.",
    medium: "Hlokomela. Netefatsa khamphani ka bowena mme o se ke wa lefa ho etsa kopo.",
    low: "Leha ho le jwalo o se ke wa lefa ho etsa kopo kapa wa romela dintlha tsa banka pele ho inthavu.",
    idTheft: "Tsebiso ena e kopa tlhahisoleseding e ka sebediswang ho utswa boitsebiso ba hao.",
    cvMatch: "Ho lumellana ha CV le mosebetsi ona",
    cvMatchIntro: "Kenya CV ya hao ho bona hore e lumellana hakae le ditlhoko tsa tsebiso ena.",
    uploadCv: "Kenya CV (.txt)",
    cvPrivacy: "CV ya hao e bapisoa mochining oa hao mme ha e bolokoe kapa ho kenngoa kae kapa kae.",
    match: "ho lumellana",
    youHave: "Seo o nang le sona",
    missing: "Se sieo ho CV ya hao",
    quickDetail: "Lintlha tse potlakileng",
  },
};

let currentLang = "en";
const t = (key) => (I18N[currentLang] || I18N.en)[key] || I18N.en[key] || key;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Fallback CV advice when no specific posting has been scored. Once one is,
// the backend returns advice built from that posting's own requirements.
const CV_TIPS_GENERAL = [
  "Match keywords from the job posting in your CV and cover letter",
  "Quantify achievements with real numbers (e.g. \"grew sales by 20%\")",
  "Keep formatting simple and text-based so ATS software can read it",
  "Only list experience and skills you can genuinely speak to in an interview",
  "Never include your ID number, banking details, or a photo of your ID on a CV",
];

let panelEl = null;

function ensurePanel() {
  if (panelEl) return panelEl;

  const panel = document.createElement("div");
  panel.id = "qhaphela-panel";
  panel.innerHTML = `
    <div class="qp-header">
      <img class="qp-shield" id="qp-logo" alt="Qhaphela">
      <span class="qp-brand">
        <span class="qp-word">QHAPHELA</span>
        <span class="qp-tagline" id="qp-tagline"></span>
      </span>
      <span class="qp-spacer"></span>
      <select class="qp-lang" id="qp-lang" aria-label="Language"></select>
      <button class="qp-icon-btn" id="qp-theme" type="button" aria-label="Toggle dark mode">☾</button>
      <button class="qp-icon-btn" id="qp-collapse" type="button" aria-label="Collapse panel">–</button>
    </div>
    <div class="qp-body" id="qp-body"></div>
  `;
  document.documentElement.appendChild(panel);

  // Real brand mark, loaded from the extension's own packaged assets.
  // Declared in web_accessible_resources so the host page can render it.
  panel.querySelector("#qp-logo").src = chrome.runtime.getURL("icons/logo-mark.png");

  const langEl = panel.querySelector("#qp-lang");
  langEl.innerHTML = Object.entries(I18N)
    .map(([code, v]) => `<option value="${code}">${v.label}</option>`)
    .join("");

  panel.querySelector("#qp-collapse").addEventListener("click", (e) => {
    e.stopPropagation();
    const collapsed = panel.classList.toggle("qhaphela-collapsed");
    panel.querySelector("#qp-collapse").textContent = collapsed ? "+" : "–";
    panel.querySelector("#qp-body").style.display = collapsed ? "none" : "";
    document.documentElement.classList.toggle("qhaphela-shifted-collapsed", collapsed);
  });
  panel.querySelector(".qp-header").addEventListener("click", () => {
    if (panel.classList.contains("qhaphela-collapsed")) panel.querySelector("#qp-collapse").click();
  });
  panel.querySelector("#qp-theme").addEventListener("click", (e) => {
    e.stopPropagation();
    const dark = panel.classList.toggle("qhaphela-dark");
    panel.querySelector("#qp-theme").textContent = dark ? "☀" : "☾";
    chrome.storage.local.set({ "qhaphela-theme": dark ? "dark" : "light" });
  });
  langEl.addEventListener("change", (e) => {
    e.stopPropagation();
    currentLang = langEl.value;
    chrome.storage.local.set({ "qhaphela-lang": currentLang });
    applyStaticText();
    // Re-render whatever is currently displayed in the newly chosen language.
    if (lastResult) renderPanelResult(lastResult);
    else if (lastScored) renderPanelListStats(lastScored);
  });

  // Theme and language are shared with the toolbar popup via storage, so a
  // choice made in one surface applies to the other.
  chrome.storage.local.get(["qhaphela-theme", "qhaphela-lang"]).then((data) => {
    if (data["qhaphela-theme"] === "dark") {
      panel.classList.add("qhaphela-dark");
      panel.querySelector("#qp-theme").textContent = "☀";
    }
    if (data["qhaphela-lang"] && I18N[data["qhaphela-lang"]]) {
      currentLang = data["qhaphela-lang"];
      langEl.value = currentLang;
    }
    applyStaticText();
  });

  // Docks the panel into the page layout rather than floating over it.
  document.documentElement.classList.add("qhaphela-shifted");

  panelEl = panel;
  applyStaticText();
  return panel;
}

function applyStaticText() {
  if (!panelEl) return;
  const tagline = panelEl.querySelector("#qp-tagline");
  if (tagline) tagline.textContent = t("tagline");
}

function setPanelConnection(ok) {
  const shield = ensurePanel().querySelector(".qp-shield");
  shield.style.opacity = ok ? "1" : "0.45";
}

// ---- Section builders -------------------------------------------------

function cardHtml(label, inner, extraClass = "") {
  return `<div class="qp-card ${extraClass}">
    ${label ? `<p class="qp-card-label">${escapeHtml(label)}</p>` : ""}
    ${inner}
  </div>`;
}

function cvTipsHtml(guidance) {
  const tailored = (guidance && guidance.tailored) || [];
  const general = (guidance && guidance.general) || CV_TIPS_GENERAL;
  const tailoredHtml = tailored.length
    ? `<ul class="qp-list arrows">${tailored.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
    : "";
  const generalHtml = `<ul class="qp-list ticks">${general.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
  return cardHtml(tailored.length ? t("cvTipsForJob") : t("cvTips"), tailoredHtml + generalHtml);
}

function safetyTipHtml() {
  return `<div class="qp-tip">
    <p class="qp-tip-title">${escapeHtml(t("safetyTip"))}</p>
    <p>${escapeHtml(t("safetyTipBody"))}</p>
  </div>`;
}

function trustedChannelsHtml() {
  const items = TRUSTED_JOB_LINKS.map(
    (l) => `<li><a class="qp-job-open" href="${l.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a></li>`
  ).join("");
  return cardHtml(t("verifiedChannels"), `<ul class="qp-list">${items}</ul>`);
}

// Safe job matches: ONLY real postings scanned on this page, with their real
// URLs and real model scores. Never invented listings -- a fabricated match
// that leads nowhere would destroy exactly the trust this tool exists to build.
function safeMatchesHtml(scored) {
  const safe = (scored || [])
    .filter((s) => s.result && s.result.tier === "LOW" && s.url)
    .sort((a, b) => a.result.score - b.result.score)
    .slice(0, 20);
  if (!safe.length) return trustedChannelsHtml();

  const rows = safe
    .map((s) => {
      const initial = escapeHtml((s.title || "?").trim().charAt(0).toUpperCase());
      return `<div class="qp-job">
        <span class="qp-job-badge">${initial}</span>
        <span class="qp-job-main">
          <span class="qp-job-title" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</span>
          <span class="qp-job-meta">${escapeHtml(s.company || "On this page")}</span>
        </span>
        <span class="qp-job-side">
          <span class="qp-job-score">${s.result.score}/100 safe</span>
          <a class="qp-job-open" href="${s.url}" target="_blank" rel="noopener noreferrer">Open job ↗</a>
        </span>
      </div>`;
    })
    .join("");

  return cardHtml(
    `${t("safeMatches")} · ${safe.length} ${t("onThisPage")}`,
    rows + `<p class="qp-note">Real postings scanned on this page, scored by the model.</p>`
  );
}

function redFlagGridHtml(flags) {
  if (!flags || !flags.length) return "";
  const rows = flags
    .map((f) => {
      const cls = f.detected ? "risks" : "ticks";
      const state = f.detected ? t("detected") : t("notDetected");
      const ev = f.detected && f.evidence ? ` — “${escapeHtml(f.evidence)}”` : "";
      return `<li class="qp-flag-row"><span><strong>${escapeHtml(f.label)}</strong><br><span class="qp-job-meta">${escapeHtml(state)}${ev} · ${escapeHtml(f.impact)}</span></span></li>`;
    })
    .join("");
  // Detected items first so the risky ones are never buried below clean ones.
  const detected = flags.filter((f) => f.detected);
  const clean = flags.filter((f) => !f.detected);
  const build = (list, cls) =>
    list.length
      ? `<ul class="qp-list ${cls}">${list
          .map((f) => {
            const ev = f.detected && f.evidence ? ` — “${escapeHtml(f.evidence)}”` : "";
            return `<li><span><strong>${escapeHtml(f.label)}</strong>${ev}<br><span class="qp-job-meta">${escapeHtml(f.detected ? f.impact : t("notDetected"))}</span></span></li>`;
          })
          .join("")}</ul>`
      : "";
  return cardHtml(t("redFlags"), build(detected, "risks") + build(clean, "ticks"));
}

function factorsHtml(ruleReasons, positives, total) {
  const up = (ruleReasons || [])
    .map((r) => `<div class="qp-factor"><span class="r">${escapeHtml(r.reason)}</span><span class="p up">+${r.points}</span></div>`)
    .join("");
  const down = (positives || [])
    .map((p) => `<div class="qp-factor"><span class="r">${escapeHtml(p.reason)}</span><span class="p down">${p.points}</span></div>`)
    .join("");
  if (!up && !down) return "";
  const label = ruleReasons && ruleReasons.length ? `${t("whyLabel")} · ${total}/100` : t("reducesRisk");
  return cardHtml(label, up + down);
}

function contactChecksHtml(checks) {
  if (!checks) return "";
  const pos = (checks.positive || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("");
  const warn = (checks.warning || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("");
  if (!pos && !warn) return "";
  return cardHtml(
    t("contactChecks"),
    (pos ? `<ul class="qp-list ticks">${pos}</ul>` : "") +
      (warn ? `<ul class="qp-list warns">${warn}</ul>` : "") +
      `<p class="qp-note">${escapeHtml(t("checkNote"))}</p>`
  );
}

function idTheftHtml(signals) {
  if (!signals || !signals.length) return "";
  return `<div class="qp-idtheft">
    <p class="qp-idtheft-title">⚠ ${escapeHtml(t("idTheftTitle"))}</p>
    <p>${escapeHtml(t("idTheft"))}</p>
    <ul class="qp-list risks">${signals.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
  </div>`;
}

// CV match: the file is read in the browser and its text sent for a single
// keyword comparison. It is never stored, logged, or written to disk on the
// backend (see the /match route), and never leaves the user's machine except
// to the local scoring service they are already running.
function cvMatchHtml(match) {
  if (!match) {
    return cardHtml(
      t("cvMatch"),
      `<p class="qp-empty">${escapeHtml(t("cvMatchIntro"))}</p>
       <label class="qp-btn ghost" for="qp-cv-file">${escapeHtml(t("uploadCv"))}</label>
       <input id="qp-cv-file" type="file" accept=".txt,.md,.csv,text/plain" class="hidden">
       <p class="qp-note">${escapeHtml(t("cvPrivacy"))}</p>`
    );
  }
  if (!match.matched.length && !match.missing.length) {
    return cardHtml(t("cvMatch"), `<p class="qp-empty">${escapeHtml(match.note)}</p>`);
  }
  const pct = match.match_percent;
  const cls = pct >= 70 ? "low" : pct >= 40 ? "medium" : "high";
  return cardHtml(
    t("cvMatch"),
    `<div class="qp-score-row">
       <span class="qp-score ${cls}">${pct}%</span>
       <span class="qp-score-max">${escapeHtml(t("match"))}</span>
     </div>
     <div class="qp-meter"><div class="qp-meter-fill ${cls}" style="width:${pct}%"></div></div>
     ${match.matched.length ? `<p class="qp-card-label">${escapeHtml(t("youHave"))}</p><ul class="qp-list ticks">${match.matched.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>` : ""}
     ${match.missing.length ? `<p class="qp-card-label">${escapeHtml(t("missing"))}</p><ul class="qp-list warns">${match.missing.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>` : ""}
     <p class="qp-note">${escapeHtml(match.note)}</p>`
  );
}

function wireCvUpload(body, jobText) {
  const input = body.querySelector("#qp-cv-file");
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const cvText = await file.text();
    chrome.runtime.sendMessage(
      { type: "QHAPHELA_MATCH", cv_text: cvText.slice(0, 20000), job_text: jobText },
      (resp) => {
        if (resp && resp.ok) {
          lastCvMatch = resp.match;
          if (lastResult) renderPanelResult(lastResult);
        }
      }
    );
  });
}

function reportHtml() {
  return cardHtml(
    "",
    `<button class="qp-btn ghost" id="qp-report-toggle" type="button">⚑ ${escapeHtml(t("reportPosting"))}</button>
     <div class="qp-report-form hidden" id="qp-report-form">
       <select class="qp-select" id="qp-report-category">
         <option value="asked_for_documents">Asked for ID / documents</option>
         <option value="asked_for_payment">Asked for payment</option>
         <option value="fake_company">Company seems fake</option>
         <option value="whatsapp_only">WhatsApp-only contact</option>
         <option value="unrealistic_salary">Unrealistic salary</option>
         <option value="other">Other</option>
       </select>
       <button class="qp-btn primary" id="qp-report-submit" type="button">${escapeHtml(t("submitReport"))}</button>
     </div>
     <p class="qp-report-count hidden" id="qp-report-count"></p>`
  );
}

// ---- Render states ----------------------------------------------------

let lastResult = null;
let lastScored = null;
// Page-level scan results, kept so the single-posting view can offer real
// safe alternatives drawn from the same page the user is already on.
let lastPageScored = null;
// Result of the most recent CV comparison, kept in memory only.
let lastCvMatch = null;

function renderPanelConnecting() {
  lastResult = null;
  const body = ensurePanel().querySelector("#qp-body");
  body.innerHTML = cardHtml("", `<p class="qp-empty">${escapeHtml(t("scanning"))}</p>`) + trustedChannelsHtml() + safetyTipHtml();
}

// Each line corresponds to a step that genuinely happens; steps are only
// ticked off as they actually complete, not on a decorative timer.
const SCAN_STEPS = [
  "Reading the posting text",
  "Checking South African scam patterns",
  "Running the AI risk model",
  "Preparing the explanation",
];

function renderPanelScanning(activeStep) {
  const body = ensurePanel().querySelector("#qp-body");
  const rows = SCAN_STEPS.map((label, i) => {
    const state = i < activeStep ? "done" : i === activeStep ? "active" : "";
    const mark = i < activeStep ? "✓" : i === activeStep ? "▸" : "·";
    return `<div class="qp-step ${state}"><span class="m">${mark}</span>${escapeHtml(label)}</div>`;
  }).join("");
  body.innerHTML = cardHtml("", rows) + safetyTipHtml();
}

function renderPanelResult(result) {
  lastResult = result;
  lastScored = null;
  setPanelConnection(true);

  const cls = result.tier === "HIGH" ? "high" : result.tier === "MEDIUM" ? "medium" : "low";
  const floored = (result.hard_floor_flags || []).length > 0;
  const verdictTitle =
    result.tier === "HIGH" ? t("verdictHigh") : result.tier === "MEDIUM" ? t("verdictMedium") : t("verdictLow");
  const advice = result.tier === "HIGH" ? t("high") : result.tier === "MEDIUM" ? t("medium") : t("low");

  const scoreCard = cardHtml(
    t("safetyScore"),
    `<div class="qp-score-row">
       <span class="qp-score ${cls}">${result.score}</span><span class="qp-score-max">/100</span>
       <span class="qp-tier ${cls}">${TIER_SYMBOLS[result.tier] || ""} ${escapeHtml(result.tier)}${floored ? " · rule floor" : ""}</span>
     </div>
     <div class="qp-meter"><div class="qp-meter-fill ${cls}" style="width:${result.score}%"></div></div>
     <p class="qp-confidence">${escapeHtml(t("confidence"))}: ${result.ai_confidence}%</p>
     <div class="qp-verdict ${cls}">
       <span class="qp-verdict-mark">${TIER_SYMBOLS[result.tier] || ""}</span>
       <span>
         <p class="qp-verdict-title">${escapeHtml(verdictTitle)}</p>
         <p class="qp-verdict-body">${escapeHtml(advice)}</p>
       </span>
     </div>`
  );

  const detailsHtml =
    redFlagGridHtml(result.red_flags) +
    factorsHtml(result.rule_reasons, result.positive_signals, result.rule_points_total) +
    contactChecksHtml(result.contact_checks);

  const body = ensurePanel().querySelector("#qp-body");
  body.innerHTML =
    scoreCard +
    idTheftHtml(result.identity_theft_signals) +
    cardHtml(
      "",
      `<button class="qp-btn primary" id="qp-open-analysis" type="button">${escapeHtml(t("viewAnalysis"))} →</button>
       <button class="qp-btn ghost" id="qp-more" type="button" style="margin-top:.45rem">${escapeHtml(t("quickDetail"))}</button>`
    ) +
    `<div id="qp-details" class="hidden">${detailsHtml}</div>` +
    reportHtml() +
    safeMatchesHtml(lastPageScored) +
    cvMatchHtml(lastCvMatch) +
    cvTipsHtml(result.cv_guidance) +
    safetyTipHtml() +
    `<p class="qp-foot">${escapeHtml(t("foot"))} ♥</p>`;

  // Hand the full-report page everything it needs: the posting text (so it
  // can highlight phrases in place) and the page's other scanned jobs (so
  // "similar jobs" are real, not invented). Stored rather than passed in the
  // URL because a posting can be thousands of characters.
  const openBtn = body.querySelector("#qp-open-analysis");
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      chrome.storage.local
        .set({
          "qhaphela-analysis": {
            posting: lastScannedText || "",
            jobs: (lastPageScored || []).map((j) => ({
              title: j.title, company: j.company, url: j.url,
              result: { score: j.result.score, tier: j.result.tier },
            })),
          },
        })
        .then(() => chrome.runtime.sendMessage({ type: "QHAPHELA_OPEN_ANALYSIS" }));
    });
  }

  const moreBtn = body.querySelector("#qp-more");
  moreBtn.addEventListener("click", () => {
    const details = body.querySelector("#qp-details");
    const nowHidden = details.classList.toggle("hidden");
    moreBtn.textContent = nowHidden ? `${t("viewAnalysis")} →` : t("lessDetail");
  });

  wireReportUi(body, result);
  wireCvUpload(body, lastScannedText || "");
}

function renderPanelUnreachable() {
  lastResult = null;
  setPanelConnection(false);
  const body = ensurePanel().querySelector("#qp-body");
  body.innerHTML = cardHtml("", `<p class="qp-empty">${escapeHtml(t("offline"))}</p>`) + trustedChannelsHtml() + safetyTipHtml();
}

function renderPanelNoPosting() {
  lastResult = null;
  const body = ensurePanel().querySelector("#qp-body");
  body.innerHTML =
    cardHtml("", `<p class="qp-empty">${escapeHtml(t("noPosting"))}</p>`) +
    safeMatchesHtml(lastPageScored) +
    cvTipsHtml(null) +
    safetyTipHtml();
}

function renderPanelListLoading(count) {
  const body = ensurePanel().querySelector("#qp-body");
  body.innerHTML =
    cardHtml("", `<p class="qp-empty">Scanning ${count} job posting${count === 1 ? "" : "s"} on this page…</p>`) + safetyTipHtml();
}

function renderPanelListStats(scored) {
  lastPageScored = scored;
  lastScored = scored;
  lastResult = null;
  if (!scored || !scored.length) return renderPanelUnreachable();
  setPanelConnection(true);

  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  scored.forEach((s) => {
    counts[s.result.tier] = (counts[s.result.tier] || 0) + 1;
  });

  const flagged = scored
    .filter((s) => s.result.tier !== "LOW")
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, 10);

  const flaggedHtml = flagged.length
    ? `<ul class="qp-list risks">${flagged
        .map((s) => `<li><span>${escapeHtml(s.title)} <strong>${s.result.score}/100</strong></span></li>`)
        .join("")}</ul>`
    : `<p class="qp-empty">No red flags in the postings currently shown. Click a listing for its full analysis.</p>`;

  const body = ensurePanel().querySelector("#qp-body");
  body.innerHTML =
    cardHtml(
      `${scored.length} ${t("onThisPage")}`,
      `<div class="qp-score-row">
         <span class="qp-job-score" style="color:var(--risk)">${counts.HIGH || 0} high risk</span>
         <span class="qp-job-score" style="color:var(--warn)">${counts.MEDIUM || 0} medium</span>
         <span class="qp-job-score">${counts.LOW || 0} low risk</span>
       </div>`
    ) +
    cardHtml(t("redFlags"), flaggedHtml) +
    safeMatchesHtml(scored) +
    cvTipsHtml(null) +
    safetyTipHtml() +
    `<p class="qp-foot">${escapeHtml(t("foot"))} ♥</p>`;
}

// ---- Reporting --------------------------------------------------------
// Counts are shown only when genuinely non-zero and always labelled as
// recorded on this device, because the store is local (qhaphela/reports.py).
// Presenting them as community-wide would be inventing data.
function renderReportCount(el, stats) {
  if (!stats) return;
  const posting = stats.posting_reports || 0;
  const domain = stats.domain_reports || 0;
  if (!posting && !domain) return el.classList.add("hidden");
  const parts = [];
  if (posting > 0) parts.push(`${posting} report${posting === 1 ? "" : "s"} on this posting`);
  if (domain > posting) parts.push(`${domain} on this site`);
  el.textContent = `${parts.join(" · ")} (recorded on this device)`;
  el.classList.remove("hidden");
}

function wireReportUi(body, result) {
  const toggle = body.querySelector("#qp-report-toggle");
  const form = body.querySelector("#qp-report-form");
  const submit = body.querySelector("#qp-report-submit");
  const countEl = body.querySelector("#qp-report-count");
  if (!toggle || !form || !submit || !countEl) return;

  chrome.runtime.sendMessage(
    { type: "QHAPHELA_REPORT_STATS", url: location.href, domain: location.hostname },
    (resp) => {
      if (resp && resp.ok) renderReportCount(countEl, resp.stats);
    }
  );

  toggle.addEventListener("click", () => form.classList.toggle("hidden"));

  submit.addEventListener("click", () => {
    submit.disabled = true;
    submit.textContent = "…";
    chrome.runtime.sendMessage(
      {
        type: "QHAPHELA_REPORT",
        url: location.href,
        domain: location.hostname,
        category: body.querySelector("#qp-report-category").value,
        excerpt: (lastScannedText || "").slice(0, 300),
        score: result.score,
      },
      (resp) => {
        if (resp && resp.ok) {
          form.classList.add("hidden");
          toggle.textContent = `✓ ${t("reported")}`;
          toggle.disabled = true;
          renderReportCount(countEl, resp.stats);
        } else {
          submit.disabled = false;
          submit.textContent = t("submitReport");
        }
      }
    );
  });
}

function extractPosting() {
  const candidates = Array.from(
    document.querySelectorAll(
      [
        "article",
        "main",
        "[role='main']",
        ".job-description",
        "#jobDescriptionText",
        ".jobsearch-JobComponent-description",
        ".jobsearch-ViewJobLayout-jobDisplay",
        "[data-testid='jobsearch-JobComponent-description']",
      ].join(", ")
    )
  );
  let container = null;
  let best = "";
  for (const el of candidates) {
    const text = (el.innerText || "").trim();
    if (text.length > best.length) {
      best = text;
      container = el;
    }
  }
  if (best.length < 200) {
    best = (document.body.innerText || "").trim();
    container = document.body;
  }
  return { text: best.slice(0, 4000), container };
}

// Matches a listing page's repeated job cards, not one open posting -- used
// for the "stats across all jobs on this page" panel view. ".job_seen_beacon"
// is Indeed's stable card class (the site this is tested against); the rest
// are best-effort generic patterns for other boards.
const JOB_CARD_SELECTOR = [
  ".job_seen_beacon",
  "article",
  "[class*='job-card']",
  "[class*='jobCard']",
  "[class*='vacancy']",
  "[class*='listing-item']",
  "[class*='result-item']",
].join(", ");

function extractJobCards() {
  const nodes = Array.from(document.querySelectorAll(JOB_CARD_SELECTOR));
  // Drop nested matches so a card counted once doesn't also get counted via
  // a child element that happens to match a second selector.
  const top = nodes.filter((el) => !nodes.some((other) => other !== el && other.contains(el)));

  const cards = [];
  for (const el of top) {
    const text = (el.innerText || "").trim();
    if (text.length < 40 || text.length > 3000) continue;
    const heading = el.querySelector("h2, h3, a");
    const title = (heading && heading.innerText.trim()) || text.slice(0, 60);
    const link = el.querySelector("a[href]");
    const url = link ? link.href : null;
    // Company name, when the card exposes one -- shown on safe-match rows.
    const companyEl = el.querySelector(
      "[data-testid='company-name'], [class*='companyName'], [class*='company-name']"
    );
    const company = companyEl ? (companyEl.innerText || "").trim().slice(0, 60) : "";
    cards.push({ el, title, company, text: text.slice(0, 1500), url });
    if (cards.length >= 20) break;
  }
  return cards;
}

function ensureHighlightStyle() {
  if (document.getElementById("qhaphela-highlight-style")) return;
  const style = document.createElement("style");
  style.id = "qhaphela-highlight-style";
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      text-decoration: underline;
      text-decoration-color: #C1473A;
      text-decoration-thickness: 2px;
      text-underline-offset: 2px;
      background: rgba(193, 71, 58, 0.12);
      cursor: help;
    }
  `;
  document.documentElement.appendChild(style);
}

function clearHighlights(container) {
  if (!container) return;
  container.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
}

// Finds every remaining, not-yet-placed phrase inside one text node and
// replaces the node with a mix of plain text and highlighted spans in a
// single pass, so multiple flags in the same sentence all get marked
// instead of only the first one found.
function highlightWithinTextNode(textNode, highlights, usedPhrases) {
  const value = textNode.nodeValue;
  const lowerValue = value.toLowerCase();
  const matches = [];

  for (const item of highlights) {
    if (usedPhrases.has(item.phrase)) continue;
    const idx = lowerValue.indexOf(item.phrase.toLowerCase());
    if (idx === -1) continue;
    matches.push({ start: idx, end: idx + item.phrase.length, reason: item.reason, phrase: item.phrase });
  }
  if (matches.length === 0) return;

  matches.sort((a, b) => a.start - b.start);
  const clean = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start < lastEnd) continue; // drop overlapping matches
    clean.push(m);
    lastEnd = m.end;
  }

  const frag = document.createDocumentFragment();
  let cursor = 0;
  for (const m of clean) {
    if (m.start > cursor) frag.appendChild(document.createTextNode(value.slice(cursor, m.start)));
    const span = document.createElement("span");
    span.className = HIGHLIGHT_CLASS;
    span.title = `Qhaphela: ${m.reason}`;
    span.textContent = value.slice(m.start, m.end);
    frag.appendChild(span);
    usedPhrases.add(m.phrase);
    cursor = m.end;
  }
  if (cursor < value.length) frag.appendChild(document.createTextNode(value.slice(cursor)));

  textNode.parentNode.replaceChild(frag, textNode);
}

function applyHighlights(container, highlights) {
  if (!container || !highlights || highlights.length === 0) return;
  ensureHighlightStyle();
  clearHighlights(container);

  const usedPhrases = new Set();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && node.nodeValue.trim().length > 0) textNodes.push(node);
  }
  for (const textNode of textNodes) {
    if (usedPhrases.size === highlights.length) break;
    highlightWithinTextNode(textNode, highlights, usedPhrases);
  }
}

function scoreTextViaMessage(text) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "QHAPHELA_SCAN_TEXT", text }, (resp) => {
      resolve(resp && resp.ok ? resp.result : null);
    });
  });
}

let lastScannedText = null;
let lastListSignature = null;

async function scanListMode(cards) {
  const signature = cards.map((c) => c.title).join("|");
  if (signature === lastListSignature) return;
  lastListSignature = signature;
  lastScannedText = null; // let single-detail mode re-trigger cleanly if the user focuses a posting next

  renderPanelListLoading(cards.length);

  const results = await Promise.all(cards.map((c) => scoreTextViaMessage(c.text)));
  const scored = cards
    .map((c, i) => ({ title: c.title, company: c.company, url: c.url, result: results[i] }))
    .filter((r) => r.result);

  renderPanelListStats(scored);
}

// Best-effort company name from the page, used only to check whether the
// contact email's domain relates to the company being advertised. Empty
// string is a fine answer -- the backend simply skips that one check rather
// than guessing.
function extractCompanyName() {
  const selectors = [
    "[data-testid='inlineHeader-companyName']",
    "[data-company-name]",
    "[class*='companyName']",
    "[class*='company-name']",
    "[itemprop='hiringOrganization']",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const name = el && (el.innerText || el.getAttribute("content") || "").trim();
    if (name && name.length < 80) return name;
  }
  return "";
}

function scanDetailMode(text, container) {
  if (text === lastScannedText) return;
  lastScannedText = text;
  lastListSignature = null;

  // Step 0 is genuinely complete by this point (the text has been extracted
  // from the DOM). Step 1 begins as the request goes out; the remaining
  // steps are ticked when the response actually lands, so the readout never
  // claims progress that hasn't happened.
  renderPanelScanning(1);

  chrome.runtime.sendMessage(
    {
      type: "QHAPHELA_SCAN",
      url: location.href,
      title: document.title,
      text,
      company_name: extractCompanyName(),
    },
    (resp) => {
      if (resp && resp.ok && resp.result) {
        applyHighlights(container, resp.result.highlights || []);
        renderPanelResult(resp.result);
      } else {
        renderPanelUnreachable();
      }
    }
  );
}

function sendForScoring() {
  const { text, container } = extractPosting();
  const isDetail = container !== document.body && text.length >= 200;
  const cards = extractJobCards();

  // Whenever a specific job's full description is actually on screen,
  // that's ground truth for "the person is looking at this one posting" --
  // always focus on it (score + underline its flags in place) regardless of
  // whether a card list is also still visible (Indeed's split layout keeps
  // both on screen at once). Only fall back to page-wide stats when there's
  // no single posting open, e.g. a pure search-results/listing page.
  if (isDetail) {
    scanDetailMode(text, container);
  } else if (cards.length >= 2) {
    scanListMode(cards);
  } else if (!lastScannedText && !lastListSignature) {
    renderPanelNoPosting();
  }
}

// Show the panel immediately on any matched job platform so "connected" is
// visible even before a specific posting has been scored.
ensurePanel();
renderPanelConnecting();

// Run once the page has settled, and again on SPA-style content swaps
// (Facebook/LinkedIn/Indeed re-render without a full navigation).
window.addEventListener("load", () => setTimeout(sendForScoring, 1200));
const observer = new MutationObserver(() => {
  clearTimeout(window.__qhaphelaDebounce);
  window.__qhaphelaDebounce = setTimeout(sendForScoring, 1500);
});
observer.observe(document.body, { childList: true, subtree: true });
