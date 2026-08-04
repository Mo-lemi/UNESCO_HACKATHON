# Qhaphela

### Protecting Opportunities. Empowering Futures.

Qhaphela ("watch out!" / "be careful!" in Zulu/Xhosa) is an AI-powered job posting fraud detection tool and media literacy resource for South African job seekers. It ships two surfaces:

- **`extension/`** — the real product: a Chrome extension that runs on job platforms and shows a live risk verdict directly on the page.
- **The web app** (`src/`, `server.ts`) — a secondary demo/testing surface for showing the same scoring engine in a browser tab, without installing the extension.

The scoring engine itself is a real trained model, not a hardcoded rules engine: a scikit-learn Random Forest + TF-IDF pipeline (`qhaphela/`) trained on labelled SA job posting data, with SHAP explanations for every score. Both surfaces call the same FastAPI service, so they always agree.

---

## ⚡ How to Run It (two processes, in order)

### Step 1: Start the ML model service
```bash
python3 -m venv venv          # first time only
source venv/bin/activate
pip install -r requirements.txt
cd qhaphela
uvicorn app:app --port 8000
```
This must be running before the extension or the web app can score anything — both are thin clients over this service.

### Step 2: Start the web app (optional, for the demo surface)
In a second terminal, from the project root:
```bash
npm install     # first time only
npm run dev
```
Open `http://localhost:3000`.

---

## 🛠️ Additional Commands

- **Run in Production Mode**:
  ```bash
  npm run build
  npm run start
  ```
- **Check for Code Errors**:
  ```bash
  npm run lint
  ```

---

## 🧩 How to Install the Chrome Extension (the actual product)

1. Make sure the ML model service from Step 1 above is running on port 8000.
2. Open Google Chrome and go to `chrome://extensions/`.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the `extension/` folder inside this project directory.

The extension runs on **any job board**, not a fixed list. It loads on all sites but stays
completely inert unless the page is genuinely a job posting — detected via schema.org
`JobPosting` metadata, job-shaped URLs, or several independent hiring phrases. No page text
leaves the browser otherwise, and it is switched off entirely on banking, tax and webmail
sites. It then docks a panel into the page layout:

- **On a listing/search page**: shows aggregate stats across every job card currently on screen (how many scanned, how many flagged high/medium risk), with a "click for more" list of the specific flagged postings.
- **When you open one specific posting**: the panel automatically switches focus to that posting's own score, tier, and plain-language advice, with the full SHAP reasons breakdown tucked behind "click for more" so the primary view stays uncluttered.
- **Safe alternatives**: real low-risk postings scanned on the same page, with their real links and real scores. Never invented listings.
- **Search everywhere**: pre-filled searches across 12 South African job platforms for the role you are viewing.

You can also click the toolbar icon for the same verdict in a popup, or paste text manually (useful for postings forwarded via WhatsApp).

---

## 🛡️ What it detects

**Fraud signals** (itemised with fixed, disclosed weights so the score is checkable):
upfront payment / registration fees, ID & banking detail requests, passport requests,
tax/SARS document requests, proof-of-residence requests, WhatsApp off-platform migration,
salary far above the market band for the stated role, fake POPIA clauses used to sound
official, unverifiable B-BBEE claims, urgency/scarcity pressure, free-email recruiters,
and youth programmes (learnerships/internships/graduate programmes) advertised with a
"no experience needed" hook.

**Identity-theft layer**: sensitive-document requests are surfaced as their own warning,
separate from the fraud score, because the harm (identity theft, SIM-swap fraud, credit
taken out in your name) is different in kind from "this job isn't real".

**Contact & domain checks**: whether the recruiter's email uses a company domain or a free
provider, whether a company website is linked, and whether the email domain actually
matches the company name being advertised (a common impersonation signal). These are
observations from the posting text — deliberately **not** labelled "verified", because no
company registry (CIPC) is queried.

**CV guidance**: qualifications, certifications, skills and experience requirements are
extracted from the posting being viewed, and turned into advice on mirroring those exact
terms *if you genuinely hold them* (ATS software matches on literal terms).

**Accessibility**: Atkinson Hyperlegible throughout, light/dark themes with every colour
pair measured for WCAG 2.2 contrast, risk tiers carry a symbol and text label as well as
colour (never colour alone), and the entire interface is available in **all 11 official South
African languages**: English, isiZulu, isiXhosa, Sesotho, Sepedi, Setswana, Xitsonga, siSwati,
Tshivenda, isiNdebele and Afrikaans.

---

## 🧪 Tests

```bash
source venv/bin/activate
pip install -r requirements.txt
cd qhaphela && pytest test_app.py -v
```

**38 tests** covering detection accuracy on real scam and real legitimate postings (including
regression tests for every false positive found during live testing), fairness toward small
informal employers, excerpt anonymisation, multi-class scam typing, explainability output,
the identity-theft layer, contact checks, CV matching, input validation and reporting.

### Honest evaluation on real postings

```bash
python qhaphela/evaluate.py
```

**12 of 12 correct · 6 of 6 scams caught · 0 false alarms**, measured through the full
production pipeline on hand-labelled real postings.

> The `1.0` figures in `models/metadata.json` are **deliberately not quoted anywhere**: they
> come from a held-out split of the synthetic training data, where the classes are trivially
> separable. A small honest sample beats an inflated one — and the tooling reports a fraction
> with its caveat rather than a percentage that implies more than was shown.

---

## 📡 API Endpoints

Both the web app (`localhost:3000`) and the model service directly (`localhost:8000`) expose the same shape:

- **Health Check**: `GET /api/health` (web app, proxied) or `GET /health` (model service directly)
- **Score Job Posting**: `POST /api/score` (web app, proxied) or `POST /score` (model service directly)
  - **Body**: `{"text": "Job text here...", "company_name": "optional"}`
  - Returns: score, tier, itemised `rule_reasons` with points, `identity_theft_signals`,
    `contact_checks`, `cv_guidance`, `highlights` (literal phrases for in-page underlining),
    and raw SHAP `top_reasons`
- **Report a posting**: `POST /report` — `{"url", "domain", "category", "excerpt", "score"}`
- **Report counts**: `GET /report-stats?url=…&domain=…`
- **CV match (text)**: `POST /match` — `{"cv_text", "job_text"}`
- **CV match (file)**: `POST /match-file` — PDF, .docx, .txt or .md, up to 5 MB
- **Model evaluation**: `GET /metrics` — real-posting results with their caveat
- **Local impact figures**: `GET /impact` — counted, never estimated

Requests are capped at 20,000 characters and rate-limited to 60/minute per client. CORS is
restricted to extension and localhost origins.

> **Privacy note**: reports are stored in a local SQLite file (`qhaphela/reports.db`, gitignored)
> and record only a hash of the posting URL, its domain, a category, and a short excerpt —
> never any reporter identity. Excerpts are **anonymised before storage** — SA ID numbers,
> phone numbers, email addresses and account numbers are stripped — per the research
> protocol's POPIA commitment. Report counts are shown as "recorded on this device" because
> the store is local; they are never presented as community-wide figures.


---

## 📄 Legal and policies

| Document | What it covers |
|---|---|
| [Privacy Policy](PRIVACY.md) | What is processed and where. Issued under **section 18 of POPIA** and meeting the Chrome Web Store user-data rules in force since 1 August 2026. |
| [Terms of Use](TERMS.md) | What Qhaphela is, what it cannot do, and how to use it fairly. |
| [Security Policy](SECURITY.md) | How to report a vulnerability, and the design constraints we hold to. |
| [Contributing](CONTRIBUTING.md) | How to help, and the one rule: never show a user something untrue. |
| [Licence](LICENSE) | MIT. |

All of these are also reachable **inside the extension** under *Privacy &
terms*, alongside a **My data** page that lists everything stored on your
device and erases it on request.

> ### Qhaphela gives you an opinion, not a verdict.
> A low score does not mean a job is safe. A high score does not mean a company
> is dishonest. **Always verify an employer yourself before sharing anything
> personal.**

---

## 🔒 Privacy in one line

No account, no analytics, no tracking. The model runs on your own computer, so
your CV and the jobs you look at **never leave your machine**.
