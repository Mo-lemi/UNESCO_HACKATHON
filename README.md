# Qhaphela - Job Posting Fraud Detector

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

The extension runs automatically on job platforms listed in `extension/manifest.json` (Indeed, Pnet, Careers24, LinkedIn, Facebook, Gumtree, CareerJunction, JobMail, and others) and injects a floating panel:

- **On a listing/search page**: shows aggregate stats across every job card currently on screen (how many scanned, how many flagged high/medium risk), with a "click for more" list of the specific flagged postings.
- **When you open one specific posting**: the panel automatically switches focus to that posting's own score, tier, and plain-language advice, with the full SHAP reasons breakdown tucked behind "click for more" so the primary view stays uncluttered.
- **Always**: a "verified job search channels" list of real trusted SA job portals (not fabricated listings — we don't have a live feed of verified openings, so we link to the real platforms instead of inventing specific "safe" postings).

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
colour (never colour alone), and safety advice is available in English, isiZulu, isiXhosa,
Sesotho and Afrikaans.

---

## 🧪 Tests

```bash
source venv/bin/activate
pip install -r requirements.txt
cd qhaphela && pytest test_app.py -v
```

25 tests covering detection accuracy on real scam and real legitimate postings (including
regression tests for false positives found during live testing), explainability output,
the identity-theft layer, contact checks, CV guidance, input validation, and reporting.

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

Requests are capped at 20,000 characters and rate-limited to 60/minute per client. CORS is
restricted to extension and localhost origins.

> **Privacy note**: reports are stored in a local SQLite file (`qhaphela/reports.db`, gitignored)
> and record only a hash of the posting URL, its domain, a category, and a short excerpt —
> never any reporter identity. Report counts are shown as "recorded on this device" because
> the store is local; they are never presented as community-wide figures.

