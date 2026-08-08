"""
Feature extraction for the Qhaphela fraud-risk model.

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

# ---- Identity-theft harvesting patterns ----
# Beyond ID/banking (already covered above): the other document types SA
# scammers commonly ask for pre-interview, each of which alone is enough to
# enable identity theft or SIM-swap fraud.
_PASSPORT_RE = re.compile(r"\b(passport (number|copy|details|document)|copy of your passport)\b", re.I)
_PROOF_RESIDENCE_RE = re.compile(
    r"\b(proof of residence|proof of address|utility bill|municipal bill)\b", re.I
)
_TAX_DOC_RE = re.compile(
    r"\b(tax (number|certificate|clearance)|sars (number|certificate|document)|irp5|tax reference)\b", re.I
)

# ---- South African scam-type patterns ----
# Youth-targeted programme types are the specific hook used against first-time
# job seekers, so they're detected as their own signal rather than folded into
# generic "job" text. Only flagged in combination with other red flags (see
# rule_points), since a real learnership posting is perfectly legitimate.
_YOUTH_PROGRAMME_RE = re.compile(
    r"\b(learnership|internship|graduate programme|graduate program|in-service training|"
    r"yes programme|youth programme|apprenticeship)\b",
    re.I,
)
_NO_EXPERIENCE_RE = re.compile(
    r"\b(no experience (needed|required|necessary)|no qualifications? (needed|required)|"
    r"anyone can apply|matric only)\b",
    re.I,
)

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
    add(_PASSPORT_RE.search(text), "Requests your passport details")
    add(_TAX_DOC_RE.search(text), "Requests tax/SARS documents")
    add(_PROOF_RESIDENCE_RE.search(text), "Requests proof of residence")
    add(_URGENCY_RE.search(text), "Urgency / scarcity pressure")

    salary_match = _SALARY_RE.search(text)
    if salary_match and _salary_mismatch_ratio(text) > 0:
        add(salary_match, "Salary above market rate for this role")

    add(_FREEMAIL_RE.search(text), "Recruiter using a free email address")

    return phrases[:8]


# Fixed, disclosed point weights for the itemized risk breakdown shown to
# users (e.g. "Requests banking details +30"). This is a second, transparent
# scoring lens shown alongside the ML model's score -- not a decomposition of
# the model's actual per-instance SHAP math, which is real but doesn't
# reduce to fixed round numbers the way a judge or job seeker expects from
# "why did this get +25". Every weight here is fixed in advance, so the
# answer to "why" is always the same regardless of which specific posting
# triggered it. Weights are ordered roughly by real-world severity: identity
# theft and financial harm signals outweigh softer manipulation tactics.
RULE_POINT_WEIGHTS = {
    "id_or_banking_request": 30,
    "upfront_payment_request": 25,
    "passport_request": 20,
    "tax_document_request": 15,
    "proof_of_residence_request": 15,
    "whatsapp_migration": 15,
    "salary_mismatch": 15,
    "fake_popia_clause": 10,
    "urgency_language": 10,
    "freemail_contact": 10,
    "youth_programme_lure": 10,
    "bbbee_no_cert": 5,
}


# ---- Red-flag category grid ----
# The eight categories surfaced in the UI as a detected/not-detected grid.
# "Not detected" is as informative as "detected" for a job seeker deciding
# whether to trust a posting, so both states are returned explicitly rather
# than only listing hits. Impact reflects the real-world consequence if the
# category IS present, not its weight in the score.
# Each entry carries the action a job seeker should actually take if the
# category fires. A warning without a recommendation leaves someone informed
# but still stuck -- the point is to tell them what to DO.
RED_FLAG_CATEGORIES = [
    ("payment_request", "Payment Request", "Critical",
     "Never pay to be considered for a job. No legitimate South African employer charges an application, training or 'starter pack' fee."),
    ("identity_document_request", "Identity Document Request", "Critical",
     "Do not send your ID, passport or certified copies before you have met the employer and confirmed the company exists."),
    ("banking_information_request", "Banking Information Request", "Critical",
     "Banking details are only needed after you have signed an employment contract. Never send them to apply."),
    ("suspicious_communication", "Suspicious Communication", "High",
     "Insist on communicating through the job platform or an official company email address you have verified yourself."),
    ("fake_urgency", "Fake Urgency", "Medium",
     "Pressure to act immediately is a tactic to stop you checking. A real employer will wait while you verify them."),
    ("unrealistic_salary", "Unrealistic Salary", "High",
     "Compare the offer against typical pay for this role in South Africa. Pay far above market rate for an entry-level job is a lure."),
    ("suspicious_email_domain", "Suspicious Email Domain", "Medium",
     "Check whether the company has its own email domain. A free address is not proof of fraud, but it is worth questioning."),
    ("whatsapp_migration", "WhatsApp Migration", "High",
     "Moving to WhatsApp makes the recruiter untraceable. Keep the conversation on the platform where there is a record."),
]


def red_flag_grid(text: str) -> list:
    """Detected/not-detected state for each red-flag category, with evidence."""
    checks = {
        "payment_request": _PAYMENT_RE.search(text),
        "identity_document_request": (
            _ID_NUMBER_RE.search(text) or _DOC_REQUEST_RE.search(text) or _PASSPORT_RE.search(text)
        ),
        "banking_information_request": _BANK_RE.search(text),
        "suspicious_communication": (
            _PHONE_RE.search(text) if _WHATSAPP_RE.search(text) else None
        ),
        "fake_urgency": _URGENCY_RE.search(text),
        "unrealistic_salary": _SALARY_RE.search(text) if _salary_mismatch_ratio(text) > 0 else None,
        "suspicious_email_domain": _FREEMAIL_RE.search(text),
        "whatsapp_migration": (
            _WHATSAPP_RE.search(text) if _PHONE_RE.search(text) else None
        ),
    }
    grid = []
    for key, label, impact, recommendation in RED_FLAG_CATEGORIES:
        match = checks.get(key)
        grid.append(
            {
                "key": key,
                "label": label,
                "detected": bool(match),
                # Evidence is the literal matched text, so a user can find it
                # in the posting themselves rather than taking our word.
                "evidence": match.group(0) if match else "",
                "impact": impact if match else "Low impact",
                # Only surfaced when the category actually fired -- advice
                # about a risk that isn't present is just noise.
                "recommendation": recommendation if match else "",
            }
        )
    return grid


# ---- Free learning resources (the GROW stage) ----
# Real, free, publicly accessible resources mapped to skills a posting may
# require. Deliberately no affiliate links, no paid courses, and no invented
# "8 week learning path" -- just where to genuinely start, free of charge,
# which matters for an unemployed audience.
LEARNING_RESOURCES = {
    "active directory": [("Microsoft Learn - Windows Server &amp; Active Directory", "https://learn.microsoft.com/en-us/training/browse/?products=windows-server")],
    "microsoft 365": [("Microsoft Learn - Microsoft 365 training", "https://learn.microsoft.com/en-us/training/browse/?products=m365")],
    "office 365": [("Microsoft Learn - Microsoft 365 training", "https://learn.microsoft.com/en-us/training/browse/?products=m365")],
    "azure": [("Microsoft Learn - Azure Fundamentals (AZ-900)", "https://learn.microsoft.com/en-us/training/paths/microsoft-azure-fundamentals-describe-cloud-concepts/")],
    "networking": [("Cisco Networking Academy - free courses", "https://skillsforall.com/"), ("Professor Messer - Network+ (free video course)", "https://www.professormesser.com/network-plus/n10-009/n10-009-video/n10-009-training-course/")],
    "ccna": [("Cisco Networking Academy - free courses", "https://skillsforall.com/")],
    "comptia a+": [("Professor Messer - A+ (free video course)", "https://www.professormesser.com/free-a-plus-training/220-1201/220-1201-video/220-1201-training-course/")],
    "a+": [("Professor Messer - A+ (free video course)", "https://www.professormesser.com/free-a-plus-training/220-1201/220-1201-video/220-1201-training-course/")],
    "comptia security+": [("Professor Messer - Security+ (free video course)", "https://www.professormesser.com/security-plus/sy0-701/sy0-701-video/sy0-701-comptia-security-plus-course/")],
    "linux": [("Linux Journey - free interactive course", "https://linuxjourney.com/"), ("TryHackMe - Linux Fundamentals", "https://tryhackme.com/module/linux-fundamentals")],
    "python": [("Python for Everybody - free full course", "https://www.py4e.com/")],
    "sql": [("SQLBolt - free interactive SQL lessons", "https://sqlbolt.com/")],
    "excel": [("Microsoft Learn - Excel training", "https://support.microsoft.com/en-us/office/excel-video-training-9bc05390-e94c-46af-a5b3-d7c22f6990bb")],
    "power bi": [("Microsoft Learn - Power BI Fundamentals", "https://learn.microsoft.com/en-us/training/paths/get-started-power-bi/")],
    "firewall": [("TryHackMe - Network Security", "https://tryhackme.com/module/network-security")],
    "troubleshooting": [("Professor Messer - A+ troubleshooting (free)", "https://www.professormesser.com/free-a-plus-training/220-1202/220-1202-video/220-1202-training-course/")],
    "helpdesk": [("Professor Messer - A+ (free video course)", "https://www.professormesser.com/free-a-plus-training/220-1201/220-1201-video/220-1201-training-course/")],
    "customer service": [("Coursera - free-to-audit customer service courses", "https://www.coursera.org/courses?query=customer%20service&productDifficultyLevel=Beginner")],
}


# ---- Multi-class scam typing ----
# Naudé et al. (2023) found that classifying the *type* of fraud gives better
# insight than a binary real/fake verdict, because different scam types cause
# different harm and call for different action. This assigns a type from the
# signals already detected -- it does not add a second model, and it returns
# "Unclassified" rather than guessing when the evidence doesn't fit a pattern.
SCAM_TYPES = {
    "identity_harvesting": (
        "Identity harvesting",
        "Collects documents that enable identity theft, SIM-swap fraud, or credit taken out in your name.",
    ),
    "advance_fee": (
        "Advance-fee scam",
        "Extracts money up front for a job that does not exist.",
    ),
    "fake_agency": (
        "Fake recruitment agency",
        "Impersonates a recruiter or company to appear legitimate while harvesting applicants.",
    ),
    "off_platform": (
        "Off-platform lure",
        "Moves you to an untraceable channel where there is no record and no recourse.",
    ),
    "youth_programme": (
        "Fake learnership or internship",
        "Targets first-time job seekers with a programme that does not exist.",
    ),
}


def classify_scam_type(text: str) -> dict:
    """
    Assign a fraud type from the signals already detected.

    Multi-label by nature -- a single posting often harvests documents *and*
    charges a fee -- so all matching types are returned, ordered by severity.
    """
    matched = []

    if (_ID_NUMBER_RE.search(text) or _DOC_REQUEST_RE.search(text)
            or _PASSPORT_RE.search(text) or _PROOF_RESIDENCE_RE.search(text)
            or _TAX_DOC_RE.search(text) or _BANK_RE.search(text)):
        matched.append("identity_harvesting")
    if _PAYMENT_RE.search(text):
        matched.append("advance_fee")
    if _YOUTH_PROGRAMME_RE.search(text) and _NO_EXPERIENCE_RE.search(text):
        matched.append("youth_programme")
    if _WHATSAPP_RE.search(text) and _PHONE_RE.search(text):
        matched.append("off_platform")
    if _FREEMAIL_RE.search(text) and (_BBBEE_RE.search(text) or _POPIA_RE.search(text)):
        matched.append("fake_agency")

    return {
        "types": [
            {"key": k, "label": SCAM_TYPES[k][0], "description": SCAM_TYPES[k][1]}
            for k in matched
        ],
        # Honest default: no pattern matched means we do not know the type,
        # not that the posting is a type we invented to fill the field.
        "primary": SCAM_TYPES[matched[0]][0] if matched else "Unclassified",
    }


def learning_for(missing_terms: list) -> list:
    """
    Free learning resources for skills a CV is missing.

    Only returns entries we actually have a real free resource for; skills
    without one are simply omitted rather than padded with a generic
    "search online" suggestion.
    """
    out, seen = [], set()
    for term in missing_terms or []:
        for title, url in LEARNING_RESOURCES.get(term.lower(), []):
            if url in seen:
                continue
            seen.add(url)
            out.append({"skill": term, "title": title, "url": url})
    return out


# ---- Risk-reducing signals ----
# Showing only what raises risk makes the tool feel like a fear machine and
# gives a job seeker no way to build confidence in a legitimate posting.
# These are the concrete things a good posting does, detected the same way.
_OFFICIAL_PORTAL_RE = re.compile(
    r"(careers?\.[a-z0-9-]+\.(?:co\.za|com)|pnet|careers24|linkedin|indeed|official (?:careers )?(?:page|portal|website))",
    re.I,
)
_FREE_RECRUITMENT_RE = re.compile(
    r"(no fees? of any kind|entirely free of charge|free of charge to candidates|do not charge any fee|no cost to (?:the )?applicants?)",
    re.I,
)
_COMPANY_INFO_RE = re.compile(
    r"((?:www\.)?[a-z0-9-]+\.(?:co\.za|com|org)|\(pty\)\s*ltd|registration number|head office)", re.I
)


# A posting shorter than this hasn't said enough for its *silence* to mean
# anything. "No payment requested" is trivially true of a four-word advert,
# and counting that as evidence of safety would let an empty posting look as
# trustworthy as a fully detailed one.
_MIN_CHARS_FOR_ABSENCE_EVIDENCE = 250


def positive_signals(text: str) -> list:
    """Factors that genuinely lower risk, with the weight they contribute."""
    signals = []
    body = text or ""
    lower = body.lower()
    substantial = len(body.strip()) >= _MIN_CHARS_FOR_ABSENCE_EVIDENCE

    # --- Presence-based: something the posting actively does right. These
    #     stand on their own regardless of length.
    if _OFFICIAL_PORTAL_RE.search(body):
        signals.append({"reason": "Posted on a recognised job platform", "points": -30})
    if _FREE_RECRUITMENT_RE.search(body):
        signals.append({"reason": "States that recruitment is free of charge", "points": -25})
    if _COMPANY_INFO_RE.search(body):
        signals.append({"reason": "Company contact or website details provided", "points": -15})
    if _SALARY_RE.search(body) and _salary_mismatch_ratio(body) == 0:
        signals.append({"reason": "Salary is within the normal range for this role", "points": -10})
    if any(t in lower for t in ("requirements", "qualification", "responsibilities", "duties")):
        signals.append({"reason": "Includes standard job requirements", "points": -5})

    # --- Absence-based: only meaningful once the posting is detailed enough
    #     that staying silent on these is a real signal, not just brevity.
    if substantial:
        if not _PAYMENT_RE.search(body) and not _BANK_RE.search(body):
            signals.append({"reason": "No payment or banking request found", "points": -25})
        if not (_ID_NUMBER_RE.search(body) or _DOC_REQUEST_RE.search(body) or _PASSPORT_RE.search(body)):
            signals.append({"reason": "No sensitive documents requested", "points": -20})

    return signals


# Document types that, if requested before an interview, constitute a direct
# identity-theft risk -- these are surfaced as their own warning layer in the
# UI, separate from the general fraud score, because the harm (identity theft,
# SIM-swap fraud, fraudulent credit applications) is distinct from "this job
# isn't real".
def identity_theft_signals(text: str) -> list:
    """Plain-language list of sensitive-document requests found in the text."""
    signals = []
    if _BANK_RE.search(text):
        signals.append("Banking details or account number")
    if _ID_NUMBER_RE.search(text) or _DOC_REQUEST_RE.search(text):
        signals.append("ID number or a copy of your ID document")
    if _PASSPORT_RE.search(text):
        signals.append("Passport number or a copy of your passport")
    if _TAX_DOC_RE.search(text):
        signals.append("Tax number, SARS document or IRP5")
    if _PROOF_RESIDENCE_RE.search(text):
        signals.append("Proof of residence or a utility bill")
    if _PAYMENT_RE.search(text):
        signals.append("An upfront payment or registration fee")
    return signals


# Signals strong enough to justify raising a posting above LOW risk on their
# own. Everything else -- a free email address, urgency wording, an
# unverified B-BBEE line -- is genuinely ambiguous: small and informal South
# African employers use Gmail and write urgently without being fraudulent.
#
# The research protocol names this exact harm: a classifier may
# "systematically misclassify legitimate postings from small local businesses
# or newly established South African start-ups because their informal
# linguistic patterns differ", which "could disrupt legitimate hiring
# pipelines and introduce bias against non-standard employers". The stated
# mitigation is to rely on "genuine security indicators such as requests for
# upfront payment or demands for identity document uploads rather than
# penalising unconventional grammar, layout choices or regional language
# variation". These keys are those genuine indicators.
STRONG_SIGNAL_KEYS = {
    "id_or_banking_request",
    "upfront_payment_request",
    "passport_request",
    "tax_document_request",
    "proof_of_residence_request",
    "whatsapp_migration",
    "salary_mismatch",
    "fake_popia_clause",
}


def has_strong_signal(text: str) -> bool:
    """True when at least one non-ambiguous fraud indicator is present."""
    labels_to_keys = {
        "Requests ID number/document or banking details": "id_or_banking_request",
        "Requests an upfront payment or registration fee": "upfront_payment_request",
        "Requests passport details before an interview": "passport_request",
        "Requests tax/SARS documents before an interview": "tax_document_request",
        "Requests proof of residence before an interview": "proof_of_residence_request",
        "Pushes you off-platform to WhatsApp": "whatsapp_migration",
        "Salary far above market rate for this role": "salary_mismatch",
        "Cites POPIA to sound official while requesting documents": "fake_popia_clause",
    }
    for item in rule_points(text)["items"]:
        if labels_to_keys.get(item["reason"]) in STRONG_SIGNAL_KEYS:
            return True
    return False


def rule_points(text: str) -> dict:
    """Itemized, disclosed point breakdown of interpretable rule-layer hits."""
    has_popia = bool(_POPIA_RE.search(text))
    has_doc_request = bool(_DOC_REQUEST_RE.search(text)) or bool(_ID_NUMBER_RE.search(text))
    has_bbbee = bool(_BBBEE_RE.search(text))
    has_cert_number = bool(_CERT_NUMBER_RE.search(text))
    has_whatsapp = bool(_WHATSAPP_RE.search(text)) and bool(_PHONE_RE.search(text))
    has_payment = bool(_PAYMENT_RE.search(text))
    # Includes _DOC_REQUEST_RE ("copy of your ID document") as well as the
    # literal "id number" -- deliberately broader than rule_features()'s
    # equivalent flag, which is left as-is because it feeds the trained
    # model's input vector and changing it would shift the feature
    # distribution the model was fitted on. This one is display-only, and
    # must stay consistent with identity_theft_signals()/hard_floor_flags(),
    # which both already treat an ID-document request as an ID request.
    has_bank_or_id = (
        bool(_BANK_RE.search(text))
        or bool(_ID_NUMBER_RE.search(text))
        or bool(_DOC_REQUEST_RE.search(text))
    )
    has_urgency = bool(_URGENCY_RE.search(text))
    has_freemail = bool(_FREEMAIL_RE.search(text))
    has_salary_mismatch = _salary_mismatch_ratio(text) > 0

    has_passport = bool(_PASSPORT_RE.search(text))
    has_tax_doc = bool(_TAX_DOC_RE.search(text))
    has_proof_residence = bool(_PROOF_RESIDENCE_RE.search(text))
    # A learnership/internship posting is perfectly legitimate on its own --
    # only treated as a lure signal when paired with a "no experience needed"
    # style hook, which is the actual youth-targeting pattern.
    has_youth_lure = bool(_YOUTH_PROGRAMME_RE.search(text)) and bool(_NO_EXPERIENCE_RE.search(text))

    items = []
    if has_bank_or_id:
        items.append({"reason": "Requests ID number/document or banking details", "points": RULE_POINT_WEIGHTS["id_or_banking_request"]})
    if has_payment:
        items.append({"reason": "Requests an upfront payment or registration fee", "points": RULE_POINT_WEIGHTS["upfront_payment_request"]})
    if has_passport:
        items.append({"reason": "Requests passport details before an interview", "points": RULE_POINT_WEIGHTS["passport_request"]})
    if has_tax_doc:
        items.append({"reason": "Requests tax/SARS documents before an interview", "points": RULE_POINT_WEIGHTS["tax_document_request"]})
    if has_proof_residence:
        items.append({"reason": "Requests proof of residence before an interview", "points": RULE_POINT_WEIGHTS["proof_of_residence_request"]})
    if has_whatsapp:
        items.append({"reason": "Pushes you off-platform to WhatsApp", "points": RULE_POINT_WEIGHTS["whatsapp_migration"]})
    if has_youth_lure:
        items.append({"reason": "Youth programme advertised with a \"no experience needed\" hook", "points": RULE_POINT_WEIGHTS["youth_programme_lure"]})
    if has_salary_mismatch:
        items.append({"reason": "Salary far above market rate for this role", "points": RULE_POINT_WEIGHTS["salary_mismatch"]})
    if has_popia and has_doc_request:
        items.append({"reason": "Cites POPIA to sound official while requesting documents", "points": RULE_POINT_WEIGHTS["fake_popia_clause"]})
    if has_urgency:
        items.append({"reason": "Urgent / scarcity pressure language", "points": RULE_POINT_WEIGHTS["urgency_language"]})
    if has_freemail:
        items.append({"reason": "Recruiter using a free email address (Gmail/Yahoo/etc.)", "points": RULE_POINT_WEIGHTS["freemail_contact"]})
    if has_bbbee and not has_cert_number:
        items.append({"reason": "Unverifiable B-BBEE claim (no certificate number)", "points": RULE_POINT_WEIGHTS["bbbee_no_cert"]})

    items.sort(key=lambda i: i["points"], reverse=True)
    total = min(sum(i["points"] for i in items), 100)
    return {"items": items, "total": total}


# ---- Contact & domain consistency checks ----
# Deliberately NOT called "company verification" or a "trust score": these
# are text-derived consistency heuristics, not verification. Verifying a
# company for real means checking CIPC registration records, which needs a
# paid/gated API this project doesn't have. Presenting a heuristic as
# "✓ Verified" would tell a job seeker a company was checked against a
# registry when it never was -- exactly the kind of unearned confidence this
# tool exists to protect people from. Each check below returns a plain
# statement of what was actually observed in the posting text.
_EMAIL_RE = re.compile(r"[\w.+-]+@([\w-]+(?:\.[\w-]+)+)", re.I)
_URL_RE = re.compile(r"\b(?:https?://)?((?:[\w-]+\.)+(?:co\.za|org\.za|ac\.za|gov\.za|com|net|org|io))\b", re.I)

# Known job platforms -- a link to one of these says nothing about the
# employer's legitimacy, so they're excluded when looking for a company's
# own web presence.
_JOB_BOARD_DOMAINS = {
    "indeed.com", "indeed.co.za", "pnet.co.za", "careers24.com", "linkedin.com",
    "facebook.com", "gumtree.co.za", "careerjunction.co.za", "jobmail.co.za",
    "glassdoor.com", "glassdoor.co.za", "adzuna.co.za", "simplyhired.co.za",
}


def _normalise_company_token(name: str) -> str:
    """Reduce a company name to comparable lowercase letters/digits only."""
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def contact_consistency(text: str, company_name: str = "") -> dict:
    """
    Observable facts about the contact details in a posting.

    Returns `positive` / `warning` lists of plain-language statements, plus
    the raw booleans. No score is returned on purpose -- a percentage would
    imply a completeness of checking that hasn't happened.
    """
    positive, warning = [], []

    emails = _EMAIL_RE.findall(text)
    email_domains = [d.lower() for d in emails]
    freemail = bool(_FREEMAIL_RE.search(text))

    # Company web presence: any linked domain that isn't a job board and
    # isn't a free email provider.
    linked_domains = {
        d.lower()
        for d in _URL_RE.findall(text)
        if d.lower() not in _JOB_BOARD_DOMAINS
        and not any(d.lower().endswith(f) for f in ("gmail.com", "yahoo.com", "outlook.com", "hotmail.com"))
    }

    if freemail:
        warning.append("Recruiter is using a free email account, not a company address")
    elif email_domains:
        positive.append(f"Contact email uses a company domain ({email_domains[0]})")
    else:
        warning.append("No contact email address found in this posting")

    if linked_domains:
        positive.append(f"Links to a company website ({sorted(linked_domains)[0]})")
    else:
        warning.append("No company website linked in this posting")

    # Does the email domain actually relate to the company name given? A
    # mismatch is a classic impersonation signal ("Standard Bank" hiring via
    # @recruitment-sa-jobs.com).
    company_token = _normalise_company_token(company_name)
    domain_match = None
    if company_token and email_domains and not freemail:
        domain_token = _normalise_company_token(email_domains[0].split(".")[0])
        domain_match = company_token[:6] in domain_token or domain_token[:6] in company_token
        if domain_match:
            positive.append("Email domain matches the company name")
        else:
            warning.append("Email domain does not match the stated company name")

    return {
        "positive": positive,
        "warning": warning,
        "has_freemail": freemail,
        "has_company_site": bool(linked_domains),
        "domain_matches_company": domain_match,
    }


# ---- CV guidance tailored to the posting being viewed ----
# Applicant tracking systems match on literal terms, so the highest-value CV
# advice is "these exact words appear in this posting -- mirror the ones you
# genuinely have". Everything below is extracted from the posting text
# itself; nothing is invented, and the wording always conditions on the
# applicant actually having the qualification ("if you have it"), because
# telling someone to list a certification they don't hold is advising them
# to lie on a CV.
_QUALIFICATION_TERMS = [
    "matric", "grade 12", "national diploma", "diploma", "degree", "honours",
    "nqf level", "bachelor", "btech", "postgraduate", "certificate",
]
_CERT_TERMS = [
    "comptia a+", "comptia network+", "comptia security+", "a+", "n+",
    "ccna", "ccnp", "mcse", "az-900", "ms-900", "aws certified", "azure",
    "itil", "pmp", "prince2", "sap", "cima", "saica", "saipa",
]
_SKILL_TERMS = [
    "active directory", "microsoft 365", "office 365", "excel", "sql", "python",
    "java", "javascript", "linux", "windows server", "networking", "firewall",
    "vpn", "help desk", "helpdesk", "customer service", "payroll", "pastel",
    "sage", "quickbooks", "power bi", "salesforce", "communication skills",
    "problem solving", "troubleshooting", "reporting", "data capturing",
]
_EXPERIENCE_RE = re.compile(
    r"\b(\d+)\s*(?:-\s*\d+\s*)?(?:\+\s*)?years?(?:\s+of)?\s+(?:post-qualification\s+|relevant\s+|working\s+)?experience\b", 
    re.I
)


def _find_terms(text_lower: str, terms: list) -> list:
    """Terms literally present in the posting, longest-match-first, deduped."""
    found = []
    for term in sorted(terms, key=len, reverse=True):
        if term in text_lower and not any(term in f for f in found):
            found.append(term)
    return found


def cv_guidance(text: str) -> dict:
    """
    CV advice derived from this specific posting's stated requirements.

    Returns `tailored` (posting-specific, may be empty) and `general`
    (always-true best practice). The caller shows tailored advice first and
    falls back to general advice when a posting states no clear requirements.
    """
    lower = (text or "").lower()
    tailored = []

    quals = _find_terms(lower, _QUALIFICATION_TERMS)
    certs = _find_terms(lower, _CERT_TERMS)
    skills = _find_terms(lower, _SKILL_TERMS)

    exp_match = _EXPERIENCE_RE.search(text or "")
    if exp_match:
        years = exp_match.group(1)
        tailored.append(
            f"This role asks for {years}+ years of experience - state your years clearly near the top of your CV."
        )
    if quals:
        tailored.append(
            f"Qualification named in this posting: {', '.join(quals[:3])} - list yours in the same words if you have it."
        )
    if certs:
        tailored.append(
            f"Certification named here: {', '.join(certs[:3])} - if you have it, name it exactly; ATS software matches the literal term."
        )
    if skills:
        tailored.append(
            f"Skills this posting names: {', '.join(skills[:5])} - mirror the ones you genuinely have."
        )

    general = [
        "Quantify achievements with real numbers (e.g. \"resolved 40+ tickets a week\")",
        "Keep formatting simple and text-based so ATS software can read it",
        "Only list experience and skills you can genuinely speak to in an interview",
        "Never include your ID number, banking details, or a photo of your ID on a CV",
    ]

    return {"tailored": tailored, "general": general}


# ---- CV ↔ job match ----
# Deliberately keyword-overlap based, not an LLM judgement. Two reasons:
# it needs no API key or network call (so it works offline, which matters
# for a data-cost-sensitive audience), and every number is reproducible --
# a user can see exactly which terms matched. An opaque "87% match" from a
# language model would be unverifiable, which is the opposite of what this
# tool is for. The CV never leaves the user's machine.
def job_match(cv_text: str, job_text: str) -> dict:
    """
    Compare a CV against a job posting's stated requirements.

    Returns matched/missing terms and a percentage derived purely from how
    many of the job's named requirements appear in the CV.
    """
    cv_lower = (cv_text or "").lower()
    job_lower = (job_text or "").lower()

    # Only compare against requirements the posting actually names -- never
    # invent a requirement the employer didn't state.
    job_terms = []
    for group in (_QUALIFICATION_TERMS, _CERT_TERMS, _SKILL_TERMS):
        job_terms.extend(_find_terms(job_lower, group))
    # Deduplicate while preserving order, dropping terms contained in a
    # longer term already present (e.g. "a+" inside "comptia a+").
    seen, terms = [], []
    for t in job_terms:
        if not any(t in s for s in seen):
            seen.append(t)
            terms.append(t)

    if not terms:
        return {
            "match_percent": 0,
            "matched": [],
            "missing": [],
            "note": "This posting does not state specific requirements, so no match could be calculated.",
        }

    # Qualification hierarchy: holding a higher qualification necessarily
    # satisfies the ones below it. Without this the tool tells a BSc graduate
    # they are "missing matric", which is both wrong and insulting, and would
    # rightly destroy their trust in every other number on the screen.
    _HIGHER = ("degree", "bachelor", "honours", "postgraduate", "btech", "national diploma", "diploma")
    _IMPLIED_BY_HIGHER = ("matric", "grade 12")
    has_higher = any(h in cv_lower for h in _HIGHER)

    # Terms that name the same real-world credential. Without this the tool
    # reports "matric ✓" and "grade 12 ✗" for the same person on the same CV.
    _SYNONYMS = {
        "matric": ("grade 12",),
        "grade 12": ("matric",),
        "a+": ("comptia a+",),
        "comptia a+": ("a+",),
        "helpdesk": ("help desk",),
        "help desk": ("helpdesk",),
        "office 365": ("microsoft 365",),
        "microsoft 365": ("office 365",),
    }

    def satisfied(term: str) -> bool:
        if term in cv_lower:
            return True
        if any(alt in cv_lower for alt in _SYNONYMS.get(term, ())):
            return True
        if term in _IMPLIED_BY_HIGHER and has_higher:
            return True
        return False

    matched = [t for t in terms if satisfied(t)]
    missing = [t for t in terms if not satisfied(t)]
    percent = int(round(len(matched) / len(terms) * 100))

    return {
        "match_percent": percent,
        "matched": matched,
        "missing": missing,
        "note": (
            f"Based on {len(terms)} requirement(s) named in this posting. "
            "Matching is on literal terms, the same way applicant tracking systems work."
        ),
    }


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
    if _PASSPORT_RE.search(text):
        flags.append("Requests passport details")
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
