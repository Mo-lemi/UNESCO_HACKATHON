"""
Qhaphela scoring API.

Serves the model trained by train.py. This is the endpoint the Chrome
extension's background service worker calls (see the extension structure in
the hackathon design doc): POST a posting's text, get back a 0-100 risk
score, a tier, plain-language reasons, and any hard-floor safety flags.

Run:
    source venv/bin/activate   # from the project root, one level up
    uvicorn app:app --reload --port 8000
"""

import os
import time
from collections import deque
from contextlib import asynccontextmanager

import joblib
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import cv_extract
import reports
import threat_intel
from features import (
    class1_shap_values,
    combine_features,
    contact_consistency,
    classify_scam_type,
    cv_guidance,
    hard_floor_flags,
    has_strong_signal,
    job_match,
    learning_for,
    positive_signals,
    red_flag_grid,
    highlight_phrases,
    identity_theft_signals,
    rule_features,
    rule_points,
)

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(HERE, "models")

_vectorizer = None
_model = None
_explainer = None
_model_name = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """
    Load model artifacts once at startup.

    Uses the lifespan API rather than the deprecated @app.on_event("startup"),
    which also means the artifacts load correctly under TestClient (on_event
    silently does not fire there, so every test saw an unloaded model).
    """
    global _vectorizer, _model, _explainer, _model_name
    _vectorizer = joblib.load(os.path.join(MODEL_DIR, "vectorizer.joblib"))
    _model = joblib.load(os.path.join(MODEL_DIR, "model.joblib"))
    explainer_path = os.path.join(MODEL_DIR, "explainer.joblib")
    _explainer = joblib.load(explainer_path) if os.path.exists(explainer_path) else None
    _model_name = type(_model).__name__
    reports.init_db()
    yield


app = FastAPI(title="Qhaphela Fraud Risk API", version="0.1.0", lifespan=lifespan)

# ---- Request limits ----
# A job posting that clears this is either not a posting or an attempt to
# make the model do unbounded work; either way it's rejected rather than
# silently truncated, so the caller knows the text wasn't fully analysed.
MAX_TEXT_CHARS = 20_000

# Simple in-process token bucket. Deliberately dependency-free: the service
# is designed to run locally alongside the extension, so this exists to stop
# a runaway loop or a single misbehaving page from pinning the CPU during a
# demo, not to defend a public endpoint. A hosted deployment would need a
# real shared-state limiter (Redis) instead.
RATE_LIMIT_REQUESTS = 60
RATE_LIMIT_WINDOW_SECONDS = 60
_request_times: dict[str, deque] = {}


def _rate_limit(request: Request) -> None:
    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    times = _request_times.setdefault(client, deque())
    while times and now - times[0] > RATE_LIMIT_WINDOW_SECONDS:
        times.popleft()
    if len(times) >= RATE_LIMIT_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded ({RATE_LIMIT_REQUESTS} requests per {RATE_LIMIT_WINDOW_SECONDS}s)",
        )
    times.append(now)


# CORS is restricted to extension origins plus the local web demo. The
# earlier allow_origins=["*"] meant any website the user visited could call
# this endpoint from their browser; chrome-extension:// and the local demo
# host are the only origins that legitimately need it.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://.*|https?://(localhost|127\.0\.0\.1)(:\d+)?)$",
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

class ScoreRequest(BaseModel):
    text: str = Field(..., max_length=MAX_TEXT_CHARS)
    company_name: str = Field("", max_length=200)
    domain: str = Field("", max_length=253)


class ContactChecks(BaseModel):
    positive: list[str]
    warning: list[str]


class CvGuidance(BaseModel):
    tailored: list[str]
    general: list[str]


class ScamType(BaseModel):
    key: str
    label: str
    description: str


class ScamClassification(BaseModel):
    types: list[ScamType]
    primary: str


class ThreatIndicator(BaseModel):
    indicator: str
    category: str
    severity: str
    note: str


class ThreatIntel(BaseModel):
    curated: list[ThreatIndicator]
    local_reports: list[ThreatIndicator]
    curated_pattern_count: int


class RedFlagCategory(BaseModel):
    key: str
    label: str
    detected: bool
    evidence: str
    impact: str
    recommendation: str


class Reason(BaseModel):
    feature: str
    contribution: float


class Highlight(BaseModel):
    phrase: str
    reason: str


class RuleReason(BaseModel):
    reason: str
    points: int


class ScoreResponse(BaseModel):
    score: int
    tier: str
    model_version: str
    top_reasons: list[Reason]
    hard_floor_flags: list[str]
    highlights: list[Highlight]
    rule_reasons: list[RuleReason]
    rule_points_total: int
    identity_theft_signals: list[str]
    contact_checks: ContactChecks
    cv_guidance: CvGuidance
    red_flags: list[RedFlagCategory]
    positive_signals: list[RuleReason]
    ai_confidence: int
    threat_intel: ThreatIntel
    scam_type: ScamClassification


TIER_THRESHOLDS = (30, 70)  # <30 Low, 30-70 Medium, >70 High


def _confidence_for(proba: float, rule_items: list, positives: list) -> int:
    """
    How confident the system is in this verdict, computed -- never hardcoded.

    Confidence measures how much *interpretable evidence* supports the
    verdict, in either direction. Both matter:

    - Red-flag hits corroborate a HIGH verdict.
    - Risk-reducing signals (recognised platform, no payment requested, no
      documents requested, company details present) corroborate a LOW
      verdict just as strongly. An earlier version counted only red flags,
      which absurdly reported low confidence for a clean posting that had
      five independent safety signals.

    Model certainty (distance of the predicted probability from the 0.5
    decision boundary) is blended in, but weighted less than the
    interpretable evidence, because live testing showed the TF-IDF layer can
    be confidently wrong on real postings it wasn't trained on.

    With no interpretable evidence at all, confidence is capped -- the model
    would be on its own, and we know it generalises poorly there.
    """
    model_certainty = abs(proba - 0.5) * 2  # 0.0 at the boundary, 1.0 at either extreme

    # Evidence saturates at three signals: one match alone shouldn't imply
    # near-certainty, but four vs. three barely changes how sure we can be.
    evidence_count = len(rule_items) + len(positives)
    corroboration = min(evidence_count, 3) / 3

    if evidence_count:
        confidence = 0.35 * model_certainty + 0.65 * corroboration
    else:
        confidence = min(model_certainty, 0.6)

    return int(round(max(0.0, min(confidence, 1.0)) * 100))


def _tier_for(score: int) -> str:
    low, high = TIER_THRESHOLDS
    if score < low:
        return "LOW"
    if score <= high:
        return "MEDIUM"
    return "HIGH"


class ReportRequest(BaseModel):
    url: str = Field("", max_length=2000)
    domain: str = Field("", max_length=253)  # max DNS name length
    category: str = Field("other", max_length=64)
    excerpt: str = Field("", max_length=300)
    score: int = Field(0, ge=0, le=100)


@app.post("/report")
def submit_report(req: ReportRequest, request: Request):
    """
    Record a user report of a suspicious posting.

    Local-only store (see reports.py) -- counts returned reflect reports made
    on this machine, and the UI must not present them as if they came from
    other users. Stores no reporter identity of any kind.
    """
    _rate_limit(request)
    return reports.add_report(req.url, req.domain, req.category, req.excerpt, req.score)


@app.get("/report-stats")
def report_stats(url: str = "", domain: str = ""):
    return reports.stats_for(url, domain)


class MatchRequest(BaseModel):
    cv_text: str = Field(..., max_length=MAX_TEXT_CHARS)
    job_text: str = Field(..., max_length=MAX_TEXT_CHARS)


class LearningResource(BaseModel):
    skill: str
    title: str
    url: str


class MatchResponse(BaseModel):
    match_percent: int
    matched: list[str]
    missing: list[str]
    note: str
    learning: list[LearningResource]


@app.post("/match", response_model=MatchResponse)
def match(req: MatchRequest, request: Request):
    """
    Compare a CV against a job posting's stated requirements.

    Privacy: the CV text is used for this single comparison and is never
    written to disk, logged, or stored -- there is no database write on this
    path at all. Matching is literal keyword overlap (see features.job_match),
    so the result is fully reproducible and explainable to the user.
    """
    _rate_limit(request)
    result = job_match(req.cv_text, req.job_text)
    result["learning"] = learning_for(result["missing"])
    return MatchResponse(**result)


@app.get("/impact")
def impact():
    """
    Real usage figures from the local store. Counts only -- never estimated,
    and explicitly scoped to this device, because no shared network exists.
    """
    return threat_intel.impact_stats()


@app.get("/metrics")
def metrics():
    """
    Evaluation on hand-labelled REAL postings.

    Deliberately does NOT serve the 1.0 figures in models/metadata.json:
    those were measured on a held-out split of the synthetic training data
    and overstate real-world performance. See evaluate.py for the reasoning.
    """
    from evaluate import evaluate as _eval
    r = _eval()
    return {
        "sample_size": r["sample_size"],
        "genuine": r["genuine"],
        "fraudulent": r["fraudulent"],
        "correct": r["true_positives"] + r["true_negatives"],
        "scams_caught": r["true_positives"],
        "scams_missed": r["false_negatives"],
        "false_alarms": r["false_positives"],
        "accuracy": r["accuracy"],
        "precision_fraud": r["precision_fraud"],
        "recall_fraud": r["recall_fraud"],
        "f1_fraud": r["f1_fraud"],
        "caveat": (
            f"Measured on {r['sample_size']} hand-labelled real postings through the full "
            "production pipeline. A small sample demonstrates correct behaviour on the cases "
            "tested; it is not a general accuracy rate and must not be quoted as one."
        ),
    }


MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # a CV over 5 MB is not a CV


@app.post("/match-file", response_model=MatchResponse)
async def match_file(
    request: Request,
    cv_file: UploadFile = File(...),
    job_text: str = Form(""),
):
    """
    Compare an uploaded CV (.txt, .md, .pdf, .docx) against a job posting.

    Privacy: the file is parsed in memory on this machine and used for one
    keyword comparison. It is never written to disk, logged, or sent
    anywhere -- there is no storage call on this path.
    """
    _rate_limit(request)

    data = await cv_file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That file is larger than 5 MB.")

    try:
        cv_text = cv_extract.extract(cv_file.filename or "", data)
    except ValueError as exc:
        # These messages are written for the user, so pass them straight through.
        raise HTTPException(status_code=400, detail=str(exc))

    result = job_match(cv_text[:MAX_TEXT_CHARS], job_text[:MAX_TEXT_CHARS])
    result["learning"] = learning_for(result["missing"])
    return MatchResponse(**result)


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _model is not None, "model_name": _model_name}


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest, request: Request):
    _rate_limit(request)
    text = req.text
    tfidf_vec = _vectorizer.transform([text])
    rule_vec = np.array([rule_features(text)])
    X = combine_features(tfidf_vec, rule_vec)

    proba = float(_model.predict_proba(X)[0, 1])
    score_val = int(round(proba * 100))

    floors = hard_floor_flags(text)
    if floors:
        score_val = max(score_val, 75)  # safety-net floor, see features.hard_floor_flags

    # Tactical ceiling, added after live-testing against real Indeed postings
    # (Aug 2026) showed the TF-IDF layer shortcut-learning on generic
    # recruiting vocabulary ("cv", "candidates", "shortlisted") from the
    # synthetic training set -- clean real postings were scoring
    # MEDIUM/HIGH with zero interpretable evidence. Until the model is
    # retrained on better data, a score isn't trusted above a low ceiling
    # unless at least one of the 8 interpretable rule signals actually
    # fired (excludes posting_length_norm, which isn't a fraud signal).
    has_rule_evidence = any(v > 0 for v in rule_vec[0][:8])
    if not has_rule_evidence:
        score_val = min(score_val, 25)

    # Fairness guard, from the research protocol's bias section: ambiguous
    # signals alone (a free email address, urgent wording) must not push a
    # posting above LOW. Small and informal South African employers use
    # Gmail and write informally without being fraudulent, and wrongly
    # flagging them disrupts legitimate hiring. Only a genuine security
    # indicator -- a payment demand, a document request, off-platform
    # migration, a salary far off market -- can raise the verdict.
    if not hard_floor_flags(text) and not has_strong_signal(text):
        score_val = min(score_val, 25)

    reasons: list[Reason] = []
    if _explainer is not None:
        dense = X.toarray()
        shap_values = _explainer.shap_values(dense)
        sv = class1_shap_values(shap_values)[0]
        feature_names = list(_vectorizer.get_feature_names_out()) + [
            "popia_clause_with_doc_request", "bbbee_claim_no_cert", "whatsapp_migration",
            "upfront_payment_request", "id_or_banking_request", "urgency_language",
            "salary_mismatch_ratio", "freemail_contact", "posting_length_norm",
        ]
        top_idx = np.argsort(np.abs(sv))[::-1][:5]
        reasons = [
            Reason(feature=feature_names[i], contribution=round(float(sv[i]), 4))
            for i in top_idx if abs(sv[i]) > 1e-6
        ]

    highlights = [Highlight(**h) for h in highlight_phrases(text)]

    points = rule_points(text)
    rule_reasons = [RuleReason(**item) for item in points["items"]]
    positives = positive_signals(text)

    return ScoreResponse(
        score=score_val,
        tier=_tier_for(score_val),
        model_version=_model_name or "unknown",
        top_reasons=reasons,
        hard_floor_flags=floors,
        highlights=highlights,
        rule_reasons=rule_reasons,
        rule_points_total=points["total"],
        identity_theft_signals=identity_theft_signals(text),
        contact_checks=ContactChecks(**{
            k: v for k, v in contact_consistency(text, req.company_name).items()
            if k in ("positive", "warning")
        }),
        cv_guidance=CvGuidance(**cv_guidance(text)),
        red_flags=[RedFlagCategory(**c) for c in red_flag_grid(text)],
        positive_signals=[RuleReason(**s) for s in positives],
        ai_confidence=_confidence_for(proba, points["items"], positives),
        threat_intel=ThreatIntel(**threat_intel.lookup(text, req.domain)),
        scam_type=ScamClassification(**classify_scam_type(text)),
    )
