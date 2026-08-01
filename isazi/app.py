"""
Isazi scoring API.

Serves the model trained by train.py. This is the endpoint the Chrome
extension's background service worker calls (see the extension structure in
the hackathon design doc): POST a posting's text, get back a 0-100 risk
score, a tier, plain-language reasons, and any hard-floor safety flags.

Run:
    source venv/bin/activate   # from the project root, one level up
    uvicorn app:app --reload --port 8000
"""

import os

import joblib
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from features import (
    class1_shap_values,
    combine_features,
    hard_floor_flags,
    highlight_phrases,
    rule_features,
)

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(HERE, "models")

app = FastAPI(title="Isazi Fraud Risk API", version="0.1.0")

# The extension calls this from a background service worker, not a hosted
# frontend origin, so CORS is opened for the hackathon demo only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

_vectorizer = None
_model = None
_explainer = None
_model_name = None


class ScoreRequest(BaseModel):
    text: str


class Reason(BaseModel):
    feature: str
    contribution: float


class Highlight(BaseModel):
    phrase: str
    reason: str


class ScoreResponse(BaseModel):
    score: int
    tier: str
    model_version: str
    top_reasons: list[Reason]
    hard_floor_flags: list[str]
    highlights: list[Highlight]


TIER_THRESHOLDS = (30, 70)  # <30 Low, 30-70 Medium, >70 High


def _tier_for(score: int) -> str:
    low, high = TIER_THRESHOLDS
    if score < low:
        return "LOW"
    if score <= high:
        return "MEDIUM"
    return "HIGH"


@app.on_event("startup")
def load_artifacts():
    global _vectorizer, _model, _explainer, _model_name
    _vectorizer = joblib.load(os.path.join(MODEL_DIR, "vectorizer.joblib"))
    _model = joblib.load(os.path.join(MODEL_DIR, "model.joblib"))
    explainer_path = os.path.join(MODEL_DIR, "explainer.joblib")
    _explainer = joblib.load(explainer_path) if os.path.exists(explainer_path) else None
    _model_name = type(_model).__name__


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _model is not None, "model_name": _model_name}


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest):
    text = req.text
    tfidf_vec = _vectorizer.transform([text])
    rule_vec = np.array([rule_features(text)])
    X = combine_features(tfidf_vec, rule_vec)

    proba = float(_model.predict_proba(X)[0, 1])
    score_val = int(round(proba * 100))

    floors = hard_floor_flags(text)
    if floors:
        score_val = max(score_val, 75)  # safety-net floor, see features.hard_floor_flags

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

    return ScoreResponse(
        score=score_val,
        tier=_tier_for(score_val),
        model_version=_model_name or "unknown",
        top_reasons=reasons,
        hard_floor_flags=floors,
        highlights=highlights,
    )
