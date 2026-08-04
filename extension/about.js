// ============================================================
// QHAPHELA — Privacy, Terms and data controls
// ============================================================
// Chrome Web Store policy (enforced from 1 August 2026) requires that data
// handling is disclosed prominently and accessibly from within the product,
// not only in a store listing. POPIA section 18 requires the same disclosure
// and that data subjects can exercise their rights.
//
// Because everything Qhaphela stores lives on this machine, the "My data"
// tab lets a user see and erase all of it directly, which is the most
// meaningful form those rights can take here.
// ============================================================

const esc = (s) => {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
};

const PANELS = {
  privacy: () => `
    <div class="card">
      <h2>The short version</h2>
      <p class="tier-word low">✓ Qhaphela does not collect your personal information</p>
      <p class="muted">No account. No login. No analytics. No advertising. No tracking.
      The analysis runs on your own computer, so there is nothing to send anywhere.</p>
      <ul class="checks ok">
        <li>Your CV never leaves your machine — it is read in memory and never saved</li>
        <li>The jobs you look at are never transmitted to us</li>
        <li>No name, ID number, email, phone, location or IP address is ever collected</li>
      </ul>
    </div>

    <div class="grid two" style="margin-top:1rem">
      <div class="card">
        <h2>What is processed, and where</h2>
        <ul class="checks ok">
          <li><strong>Job posting text</strong> — scored on your computer, not kept</li>
          <li><strong>Company name on the page</strong> — used to check the recruiter's email domain, not kept</li>
          <li><strong>Your CV, if you upload one</strong> — parsed in memory, never written to disk</li>
        </ul>
        <ul class="checks warn">
          <li><strong>Language and theme</strong> — kept in your browser until you clear it</li>
          <li><strong>Tracked applications</strong> — kept in your browser until you delete them</li>
          <li><strong>Reports you submit</strong> — kept in a file on your computer</li>
        </ul>
      </div>
      <div class="card">
        <h2>When Qhaphela does nothing at all</h2>
        <p class="muted">The extension loads on all sites so it can protect you on any job board,
        including small South African ones we could not list in advance. It stays completely
        inactive unless the page is genuinely a job posting.</p>
        <ul class="checks ok">
          <li>On other pages nothing is added and nothing is sent anywhere</li>
          <li>Switched off entirely on banking, tax and webmail sites</li>
        </ul>
        <p class="note">A page only qualifies if it declares itself a job posting in its metadata,
        has a job-shaped address, or contains several independent hiring phrases.</p>
      </div>
    </div>

    <div class="card" style="margin-top:1rem">
      <h2>Reports, and how they are anonymised</h2>
      <p class="muted">A report stores a one-way hash of the page address, the site domain, the
      category you chose, a short excerpt and the score. Before the excerpt is saved, identifiers
      are stripped from it automatically.</p>
      <ul class="checks ok">
        <li>South African ID numbers, phone numbers, email addresses and account numbers are replaced</li>
        <li>Nothing about <em>you</em> is recorded — no name, no identifier</li>
        <li>Counts are labelled “recorded on this device”, because there is no shared network</li>
      </ul>
      <p class="note">Issued under section 18 of the Protection of Personal Information Act 4 of 2013.
      Complaints: Information Regulator (South Africa), complaints.IR@justice.gov.za</p>
    </div>`,

  terms: () => `
    <div class="card">
      <h2>The most important thing on this page</h2>
      <p class="tier-word medium">! Qhaphela gives you an opinion, not a verdict</p>
      <p class="muted">A <strong>low</strong> score does not mean a job is safe.
      A <strong>high</strong> score does not mean a company is dishonest.
      Always verify an employer yourself before sharing anything personal.</p>
    </div>

    <div class="grid two" style="margin-top:1rem">
      <div class="card">
        <h2>What Qhaphela cannot do</h2>
        <ul class="checks warn">
          <li><strong>It reads words, not intentions.</strong> A careful scammer who avoids obvious
          phrasing can score low, and fraud often begins after you apply, by email or WhatsApp.</li>
          <li><strong>It does not verify companies.</strong> No CIPC record or LinkedIn profile is
          checked. Contact checks describe what appears in the posting text, nothing more.</li>
          <li><strong>It can be wrong both ways.</strong> It is built not to penalise informal
          wording from small employers, but no automated system is perfect.</li>
          <li><strong>Its model was trained on synthetic data.</strong> Real-world evaluation is
          reported openly, on a small sample, and stated as such.</li>
          <li><strong>It is not legal, financial or career advice.</strong></li>
        </ul>
      </div>
      <div class="card">
        <h2>Using it fairly</h2>
        <ul class="checks ok">
          <li>Use it to protect yourself and the people around you</li>
          <li>Report postings you genuinely believe are suspicious</li>
        </ul>
        <ul class="checks bad">
          <li>Do not treat a score as proof that a company or person is fraudulent</li>
          <li>Do not publish an accusation against a real employer based on a score alone</li>
        </ul>
        <p class="note">A high score reflects wording in an advertisement, which may not even have
        been written by the company it names — impersonation is one of the frauds Qhaphela detects.</p>
      </div>
    </div>

    <div class="card" style="margin-top:1rem">
      <h2>No warranty</h2>
      <p class="muted">Qhaphela is provided “as is”, without warranty. It is a research prototype
      and a student project, not a commercial security product. To the fullest extent permitted by
      South African law the author is not liable for loss arising from its use — including a scam it
      failed to flag, or an opportunity missed because a genuine posting was flagged. This does not
      limit liability that cannot lawfully be excluded.</p>
      <p class="note">Open source under the MIT Licence. Governed by the law of the Republic of South Africa.</p>
    </div>`,

  data: () => `
    <div class="card">
      <h2>Everything Qhaphela has stored on this device</h2>
      <div id="data-summary"><p class="muted">Reading…</p></div>
      <p class="note">This is the complete list. Nothing else exists, because nothing is sent
      anywhere else.</p>
    </div>

    <div class="grid two" style="margin-top:1rem">
      <div class="card">
        <h2>Erase it</h2>
        <p class="muted">Removes your language and theme preference and every tracked application
        from this browser, immediately and permanently.</p>
        <button class="btn primary block" id="btn-clear" type="button" style="margin-top:.6rem">
          Clear all my data
        </button>
        <p class="note" id="clear-status"></p>
      </div>
      <div class="card">
        <h2>Reports you submitted</h2>
        <p class="muted">Reports live in a file on your computer, outside the browser, so they must
        be deleted there:</p>
        <p class="evidence-ctx" style="margin-top:.5rem">qhaphela/reports.db</p>
        <p class="muted">Deleting that file erases every report permanently. The service recreates
        an empty one when it next starts.</p>
        <p class="note">Removing the extension removes everything it stored in the browser.</p>
      </div>
    </div>`,

  about: () => `
    <div class="card">
      <h2>Qhaphela</h2>
      <p class="tier-word low">Protecting Opportunities. Empowering Futures.</p>
      <p class="muted"><strong>Qhaphela</strong> means “be careful” or “take heed” in isiZulu and
      isiXhosa. It reads job advertisements you are already viewing, estimates how likely they are
      to be fraudulent, explains why in plain language, and warns you about requests that could
      enable identity theft.</p>
      <p class="muted">It exists because young South Africans looking for work are targeted with
      fake learnerships, fake internships and fake graduate programmes designed to harvest ID
      numbers, banking details and money.</p>
    </div>

    <div class="grid two" style="margin-top:1rem">
      <div class="card">
        <h2>Available in every official language</h2>
        <ul class="checks ok">
          <li>English · isiZulu · isiXhosa · Sesotho</li>
          <li>Sepedi · Setswana · Xitsonga · siSwati</li>
          <li>Tshivenda · isiNdebele · Afrikaans</li>
        </ul>
        <p class="note">Translations were prepared without first-language review and corrections
        are welcome — a safety warning that reads awkwardly undermines the trust it exists to build.</p>
      </div>
      <div class="card">
        <h2>Research basis</h2>
        <p class="muted">Accompanies postgraduate research at the Central University of Technology,
        Free State: <em>“A Machine Learning Approach for Detecting Fraudulent Job Postings to Fight
        Identity Theft Among South African Job Seekers.”</em></p>
        <p class="muted">Random Forest with TF-IDF features and an interpretable rule layer, with
        SHAP explanations. Evaluation on real postings is published in the repository, sample size
        stated.</p>
      </div>
    </div>`,
};

function render(which) {
  document.getElementById("main").innerHTML = PANELS[which]();
  if (which === "data") wireData();
}

async function wireData() {
  const summary = document.getElementById("data-summary");
  const local = await chrome.storage.local.get(null);
  const tracked = Array.isArray(local["qhaphela-tracked"]) ? local["qhaphela-tracked"] : [];

  const rows = [
    ["Language preference", local["qhaphela-lang"] || "not set"],
    ["Theme preference", local["qhaphela-theme"] || "not set"],
    ["Tracked applications", `${tracked.length}`],
    ["Personal information", "none — never collected"],
    ["Your CV", "not stored — parsed in memory only"],
    ["Browsing history", "not stored — never collected"],
  ];

  summary.innerHTML = rows
    .map(
      ([k, v]) => `<div class="bar-row" style="grid-template-columns:1fr auto">
        <span class="bar-label">${esc(k)}</span>
        <span class="bar-val">${esc(v)}</span>
      </div>`
    )
    .join("");

  document.getElementById("btn-clear").addEventListener("click", async () => {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    document.getElementById("clear-status").textContent =
      "Cleared. Preferences and tracked applications have been erased from this browser.";
    wireData();
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

chrome.storage.local.get(["qhaphela-theme"]).then((d) => {
  if (d["qhaphela-theme"] === "dark") {
    document.body.classList.add("dark");
    document.getElementById("btn-theme").textContent = "☀";
  }
  render("privacy");
});
