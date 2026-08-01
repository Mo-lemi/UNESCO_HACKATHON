"""
Feature extraction for the Isazi fraud-risk model.

Two layers, kept deliberately separate so every model decision stays
auditable (per the research proposal's opacity/XAI argument):

1. Localised rule-layer features -- explicit, human-readable signals for the
   South African deception patterns the underlying research identifies
   (fake POPIA clauses, fabricated B-BBEE claims, WhatsApp migration,
   upfront-fee requests, ID/banking requests, urgency language, salary
   mismatch, free-email contact domains).
2. TF-IDF lexical features -- general vocabulary signal, following
   Mehboob & Malik (2021).

RULE_FEATURE_NAMES defines the column order the rule layer always emits, so
train.py and app.py can build the same feature vector shape from the same
function.
"""

import re

import numpy as np
from scipy.sparse import csr_matrix, hstack

RULE_FEATURE_NAMES = [
    "popia_clause_with_doc_request",
    "bbbee_claim_no_cert",
    "whatsapp_migration",
    "upfront_payment_request",
    "id_or_banking_request",
    "urgency_language",
    "salary_mismatch_ratio",
    "freemail_contact",
    "posting_length_norm",
]

_POPIA_RE = re.compile(r"\bpopia\b", re.I)
_DOC_REQUEST_RE = re.compile(r"\b(copy of your id|id document|identity document|id copy)\b", re.I)
_BBBEE_RE = re.compile(r"\bb-?bbee\b", re.I)
_CERT_NUMBER_RE = re.compile(r"\bcertificate\s*(no\.?|number)\s*[:#]?\s*\w+", re.I)
_WHATSAPP_RE = re.compile(r"\bwhatsapp\b", re.I)
_PHONE_RE = re.compile(r"\b0[6-8][0-9]{1}[\s-]?\d{3}[\s-]?\d{4}\b")
_PAYMENT_RE = re.compile(
    r"\b(registration fee|processing fee|deposit|pay(ment)? (of|before)|admin fee)\b", re.I
)
_BANK_RE = re.compile(r"\b(bank(ing)? (account|details)|account number)\b", re.I)
_ID_NUMBER_RE = re.compile(r"\bid number\b", re.I)
_URGENCY_RE = re.compile(
    r"\b(urgent|immediately|only \d+ slots?|apply within|limited (spaces|spots|slots)|act fast|"
    r"today only|closes tonight)\b",
    re.I,
)

# Matches "R28,000", "R 28 000" and plain "R28000" -- South African postings
# commonly use a comma or space thousands separator, which a plain \d{4,6}
# pattern silently fails to match at all (the comma breaks the digit run).
_SALARY_RE = re.compile(r"r\s?(\d{1,3}(?:[,\s]\d{3})+|\d{4,6})\s*(per month|/month|pm)?", re.I)
_FREEMAIL_RE = re.compile(r"@(gmail|yahoo|outlook|hotmail)\.com", re.I)

# Rough legitimate monthly ZAR bands per role, used only for the mismatch ratio.
# Falls back to a generic (5000, 20000) band when the role isn't recognised.
ROLE_SALARY_BAND = {
    "data capturer": (6000, 12000),
    "administrator": (7000, 14000),
    "call centre agent": (6500, 12000),
    "warehouse assistant": (5500, 9000),
    "cashier": (5000, 8500),
    "receptionist": (6000, 11000),
    "general worker": (4500, 8000),
    "driver": (6000, 11000),
    "cleaner": (4200, 7000),
    "it support technician": (10000, 20000),
    "hr assistant": (8000, 15000),
    "sales representative": (7000, 15000),
    "software developer": (18000, 45000),
    "accountant": (14000, 28000),
    "security officer": (5000, 9000),
}
_DEFAULT_BAND = (5000, 20000)


def _salary_mismatch_ratio(text: str) -> float:
    m = _SALARY_RE.search(text)
    if not m:
        return 0.0
    salary = int(re.sub(r"[,\s]", "", m.group(1)))
    lower = text.lower()
    band = _DEFAULT_BAND
    for role, rng in ROLE_SALARY_BAND.items():
        if role in lower:
            band = rng
            break
    _, hi = band
    if salary <= hi:
        return 0.0
    return min((salary - hi) / hi, 3.0)  # cap to keep outliers from dominating


def rule_features(text: str) -> list:
    """Return the fixed-order rule-layer feature vector for one posting."""
    has_popia = bool(_POPIA_RE.search(text))
    has_doc_request = bool(_DOC_REQUEST_RE.search(text)) or bool(_ID_NUMBER_RE.search(text))
    has_bbbee = bool(_BBBEE_RE.search(text))
    has_cert_number = bool(_CERT_NUMBER_RE.search(text))
    has_whatsapp = bool(_WHATSAPP_RE.search(text)) and bool(_PHONE_RE.search(text))
    has_payment = bool(_PAYMENT_RE.search(text))
    has_bank_or_id = bool(_BANK_RE.search(text)) or bool(_ID_NUMBER_RE.search(text))
    has_urgency = bool(_URGENCY_RE.search(text))
    has_freemail = bool(_FREEMAIL_RE.search(text))

    return [
        1.0 if (has_popia and has_doc_request) else 0.0,
        1.0 if (has_bbbee and not has_cert_number) else 0.0,
        1.0 if has_whatsapp else 0.0,
        1.0 if has_payment else 0.0,
        1.0 if has_bank_or_id else 0.0,
        1.0 if has_urgency else 0.0,
        _salary_mismatch_ratio(text),
        1.0 if has_freemail else 0.0,
        min(len(text) / 500.0, 3.0),
    ]


def rule_matrix(texts) -> np.ndarray:
    return np.array([rule_features(t) for t in texts], dtype=float)


def highlight_phrases(text: str) -> list:
    """
    Literal substrings of `text` worth underlining in place, each with a
    plain-language reason. Deliberately returns actual matched text (not
    abstract feature names like "urgency_language") so a content script can
    find and highlight the exact phrase inside the live page -- this is
    what makes "why flagged" legible directly in the posting, not just in a
    separate popup panel.
    """
    phrases = []
    taken_spans = []

    def add(match, reason):
        if match is None:
            return
        span = match.span()
        for s, e in taken_spans:
            if span[0] < e and s < span[1]:  # overlaps an already-claimed span
                return
        taken_spans.append(span)
        phrases.append({"phrase": match.group(0), "reason": reason})

    popia_match = _POPIA_RE.search(text)
    doc_match = _DOC_REQUEST_RE.search(text) or _ID_NUMBER_RE.search(text)
    if popia_match and doc_match:
        add(popia_match, "Cites POPIA to sound official")
        add(doc_match, "Requests your ID document/number")
    elif doc_match:
        add(doc_match, "Requests your ID document/number")

    bbbee_match = _BBBEE_RE.search(text)
    if bbbee_match and not _CERT_NUMBER_RE.search(text):
        add(bbbee_match, "B-BBEE claim with no certificate number")

    whatsapp_match = _WHATSAPP_RE.search(text)
    phone_match = _PHONE_RE.search(text)
    if whatsapp_match and phone_match:
        add(whatsapp_match, "Pushes you off-platform to WhatsApp")
        add(phone_match, "Unverified contact number")

    add(_PAYMENT_RE.search(text), "Requests an upfront payment")
    add(_BANK_RE.search(text), "Requests banking details")
    add(_URGENCY_RE.search(text), "Urgency / scarcity pressure")

    salary_match = _SALARY_RE.search(text)
    if salary_match and _salary_mismatch_ratio(text) > 0:
        add(salary_match, "Salary above market rate for this role")

    add(_FREEMAIL_RE.search(text), "Recruiter using a free email address")

    return phrases[:8]


def hard_floor_flags(text: str) -> list:
    """
    Explicit safety-net flags that floor the risk score at HIGH regardless of
    the model probability -- an ID/banking request or an upfront payment
    demand before an interview is treated as non-negotiable, per the
    proposal's own ethics section on avoiding over-reliance on a single
    opaque probability.
    """
    flags = []
    if _BANK_RE.search(text) or _ID_NUMBER_RE.search(text) or _DOC_REQUEST_RE.search(text):
        flags.append("Requests ID number/document or banking details")
    if _PAYMENT_RE.search(text):
        flags.append("Requests an upfront payment or registration fee")
    return flags


def combine_features(tfidf_matrix, rule_feats: np.ndarray):
    """Horizontally stack TF-IDF (sparse) with rule features (dense) into one matrix."""
    return hstack([tfidf_matrix, csr_matrix(rule_feats)]).tocsr()


def class1_shap_values(shap_values) -> np.ndarray:
    """
    Normalise a shap.TreeExplainer().shap_values() result to a plain
    (n_samples, n_features) array of fraud-class (label 1) contributions,
    regardless of SHAP version. Older SHAP returns a 2-item list (one array
    per class); newer SHAP (>=0.45) returns a single (samples, features,
    classes) ndarray for multi-class/binary tree models.
    """
    if isinstance(shap_values, list):
        return np.asarray(shap_values[1])
    arr = np.asarray(shap_values)
    if arr.ndim == 3:
        return arr[:, :, 1]
    return arr
