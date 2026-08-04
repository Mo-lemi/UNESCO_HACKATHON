"""
Tests for the Qhaphela scoring API and feature layer.

Fixtures are the real postings used to validate this system by hand: known
South African scam patterns, and real legitimate postings taken from live
job boards (the IT Helpdesk and graduate-programme cases both previously
triggered false positives, which is why they're pinned here as regression
tests).

Run:
    source venv/bin/activate    # from the project root
    pip install pytest httpx
    pytest qhaphela/ -v
"""

import pytest
from fastapi.testclient import TestClient

import features
import reports
from app import MAX_TEXT_CHARS, app


@pytest.fixture(scope="module")
def client():
    """
    TestClient as a context manager so the lifespan handler actually runs --
    without this the model artifacts are never loaded and every scoring test
    fails against a None model.
    """
    with TestClient(app) as c:
        yield c


# --- Fixtures: real postings, not invented text ---------------------------

SCAM_CLASSIC = (
    "Receptionist position available, Gqeberha, R21836/month, apply today! A small "
    "registration fee is required to process your onboarding pack. Kindly WhatsApp "
    "0614009366 with your full ID number and banking details for verification as per "
    "our POPIA data policy. Act fast, this offer closes tonight!"
)

SCAM_YOUTH_LEARNERSHIP = (
    "Exciting learnership opportunity for unemployed youth! No experience required, "
    "matric only. Stipend R8000 per month. To secure your place please email a certified "
    "copy of your ID document, proof of residence, your tax number and a copy of your "
    "passport to recruitment.sa2026@gmail.com. A R250 registration fee applies for the "
    "starter pack. Limited spaces, apply today only!"
)

LEGIT_IT_HELPDESK = (
    "We are recruiting on behalf of our client for an IT Helpdesk Technician (Level 2+). "
    "Serve as the primary escalation point for Level 1 helpdesk tickets. Manage user "
    "accounts, permissions, and access controls through Active Directory. Matric "
    "(Grade 12) as a minimum. CompTIA A+ or Microsoft certifications preferred."
)

LEGIT_GRADUATE_PROGRAMME = (
    "Standard Bank is recruiting for its 2026 Graduate Programme in Johannesburg. "
    "Applicants should hold a completed degree in Finance, Accounting or Economics. The "
    "programme runs for 18 months with a market-related stipend. To apply, submit your CV "
    "and academic transcript via our official careers portal at careers.standardbank.co.za."
)


def _score(client, text, company_name=""):
    resp = client.post("/score", json={"text": text, "company_name": company_name})
    assert resp.status_code == 200, resp.text
    return resp.json()


# --- Core detection -------------------------------------------------------


@pytest.mark.parametrize("text", [SCAM_CLASSIC, SCAM_YOUTH_LEARNERSHIP])
def test_known_scams_score_high(text, client):
    result = _score(client, text)
    assert result["tier"] == "HIGH"
    assert result["score"] >= 70
    assert result["hard_floor_flags"], "a scam requesting documents/payment must trip a hard floor"


@pytest.mark.parametrize("text", [LEGIT_IT_HELPDESK, LEGIT_GRADUATE_PROGRAMME])
def test_real_legitimate_postings_score_low(text, client):
    """Regression: both of these previously scored MEDIUM/HIGH with no real evidence."""
    result = _score(client, text)
    assert result["tier"] == "LOW"
    assert result["score"] < 30
    assert result["rule_reasons"] == []


def test_score_never_exceeds_ceiling_without_rule_evidence(client):
    """A score can't claim high risk when no interpretable signal actually fired."""
    result = _score(client, LEGIT_IT_HELPDESK)
    assert result["rule_points_total"] == 0
    assert result["score"] <= 25


def test_legit_learnership_not_flagged_by_youth_pattern(client):
    """A real graduate programme must not trip the youth-lure signal on its own."""
    result = _score(client, LEGIT_GRADUATE_PROGRAMME)
    reasons = [r["reason"] for r in result["rule_reasons"]]
    assert not any("Youth programme" in r for r in reasons)


# --- Fairness: bias against small/informal employers ---------------------

SMALL_INFORMAL_BUSINESS = (
    "Small bakery in Soweto looking for a shop assistant. Duties include serving customers, "
    "stock taking and keeping the shop clean. Grade 10 or higher. R4500 per month. Send your CV "
    "to sowetobakery.jobs@gmail.com. We are a family business, no experience needed, we will "
    "train you. Please come in person to discuss."
)


def test_small_informal_business_is_not_flagged(client):
    """
    Regression, from the research protocol's bias section: a genuine small
    South African employer using a free email address and informal wording
    must not be pushed above LOW. It previously scored 58/MEDIUM purely for
    using Gmail, which is exactly the "bias against non-standard employers"
    the protocol commits to preventing.
    """
    r = _score(client, SMALL_INFORMAL_BUSINESS)
    assert r["tier"] == "LOW", f"small informal employer wrongly flagged: {r['score']}"
    assert r["score"] <= 25


def test_ambiguous_signal_alone_cannot_raise_risk(client):
    """A free email address on its own is not evidence of fraud."""
    r = _score(client, "We are hiring a cleaner. Please email your CV to smallshop@gmail.com. Start soon.")
    assert r["tier"] == "LOW"


def test_strong_signal_still_raises_risk(client):
    """The guard must not blunt genuine indicators."""
    r = _score(client, "Send a certified copy of your ID document and a R250 registration fee to apply.")
    assert r["tier"] == "HIGH"


# --- Privacy: excerpt anonymisation --------------------------------------


def test_report_excerpt_is_anonymised_before_storage():
    """
    The research protocol commits to removing telephone numbers, personal
    email addresses and identity numbers from stored data.
    """
    raw = "Send ID 0108175401083, call 067 675 9901, email someone@example.com, acct 1234567890"
    cleaned = reports.anonymise(raw)
    assert "0108175401083" not in cleaned
    assert "067 675 9901" not in cleaned
    assert "someone@example.com" not in cleaned
    assert "1234567890" not in cleaned


# --- Multi-class scam typing ---------------------------------------------


def test_scam_type_classification(client):
    r = _score(client, SCAM_YOUTH_LEARNERSHIP)
    labels = " ".join(t["label"] for t in r["scam_type"]["types"]).lower()
    assert "identity harvesting" in labels
    assert "advance-fee" in labels
    assert r["scam_type"]["primary"] != "Unclassified"


def test_scam_type_unclassified_when_no_pattern(client):
    """Must say it does not know, rather than inventing a type."""
    r = _score(client, LEGIT_IT_HELPDESK)
    assert r["scam_type"]["types"] == []
    assert r["scam_type"]["primary"] == "Unclassified"


# --- Explainability -------------------------------------------------------


def test_rule_reasons_are_itemised_and_sorted(client):
    result = _score(client, SCAM_CLASSIC)
    points = [r["points"] for r in result["rule_reasons"]]
    assert points, "a known scam must produce itemised reasons"
    assert points == sorted(points, reverse=True), "reasons must be ordered by severity"
    assert all(r["reason"] and r["points"] > 0 for r in result["rule_reasons"])


def test_rule_points_total_is_capped_at_100(client):
    result = _score(client, SCAM_YOUTH_LEARNERSHIP)
    assert 0 <= result["rule_points_total"] <= 100


def test_highlights_are_literal_substrings_of_the_posting(client):
    """Highlights must be findable in the page text, or in-page underlining breaks."""
    result = _score(client, SCAM_CLASSIC)
    assert result["highlights"]
    for h in result["highlights"]:
        assert h["phrase"].lower() in SCAM_CLASSIC.lower()
        assert h["reason"]


# --- Identity theft layer -------------------------------------------------


def test_identity_theft_signals_detected(client):
    result = _score(client, SCAM_YOUTH_LEARNERSHIP)
    signals = " ".join(result["identity_theft_signals"]).lower()
    assert "id number" in signals or "id document" in signals
    assert "passport" in signals
    assert "tax number" in signals
    assert "proof of residence" in signals


def test_no_identity_theft_signals_on_clean_posting(client):
    result = _score(client, LEGIT_IT_HELPDESK)
    assert result["identity_theft_signals"] == []


def test_id_document_request_is_consistent_across_layers(client):
    """Regression: 'copy of your ID document' must count in all three layers."""
    text = "Please send a certified copy of your ID document to apply."
    assert features.identity_theft_signals(text)
    assert features.hard_floor_flags(text)
    reasons = [r["reason"] for r in features.rule_points(text)["items"]]
    assert any("ID number/document" in r for r in reasons)


# --- Contact & domain consistency ----------------------------------------


def test_company_name_domain_mismatch_flagged(client):
    text = (
        "Standard Bank is hiring a Teller in Sandton. Send your CV to "
        "hr@quickjobs-recruit-sa.com. Visit quickjobs-recruit-sa.com for details."
    )
    result = _score(client, text, company_name="Standard Bank")
    warnings = " ".join(result["contact_checks"]["warning"]).lower()
    assert "does not match" in warnings


def test_matching_company_domain_is_positive(client):
    text = (
        "Thandeka Retail is hiring a Cashier in Cape Town. Apply via "
        "careers.thandeka.co.za or email jobs@thandeka.co.za."
    )
    result = _score(client, text, company_name="Thandeka Retail")
    positives = " ".join(result["contact_checks"]["positive"]).lower()
    assert "matches the company name" in positives


def test_freemail_recruiter_flagged(client):
    result = _score(client, "Send your ID document to recruitment.sa2026@gmail.com today.")
    warnings = " ".join(result["contact_checks"]["warning"]).lower()
    assert "free email" in warnings


# --- CV guidance ----------------------------------------------------------


def test_cv_guidance_is_tailored_to_the_posting(client):
    """Advice must name requirements actually stated in this posting."""
    result = _score(client, LEGIT_IT_HELPDESK)
    tailored = " ".join(result["cv_guidance"]["tailored"]).lower()
    assert tailored, "a posting with clear requirements should yield tailored advice"
    assert "comptia a+" in tailored  # named certification
    assert "active directory" in tailored  # named skill
    assert "matric" in tailored or "grade 12" in tailored  # named qualification


def test_cv_guidance_falls_back_to_general_when_no_requirements(client):
    result = _score(client, "We are hiring. Contact us.")
    assert result["cv_guidance"]["tailored"] == []
    assert result["cv_guidance"]["general"], "general advice must always be present"


def test_cv_guidance_never_advises_claiming_credentials_you_lack(client):
    """Tailored advice must be conditional, never 'add this to your CV'."""
    result = _score(client, LEGIT_IT_HELPDESK)
    for line in result["cv_guidance"]["tailored"]:
        lowered = line.lower()
        if "certification" in lowered or "qualification" in lowered:
            assert "if you have" in lowered or "yours" in lowered, (
                f"advice must condition on genuinely holding it: {line!r}"
            )


# --- CV ↔ job match -------------------------------------------------------

JOB_WITH_REQS = (
    "IT Helpdesk Technician. Manage user accounts through Active Directory. "
    "Microsoft 365 support. Matric (Grade 12) minimum. CompTIA A+ or CCNA preferred. "
    "2-4 years experience. SQL reporting an advantage."
)


def test_graduate_cv_scores_higher_than_school_leaver(client):
    grad = (
        "BSc Information Technology degree. Linux, Networking, Python, Active Directory, "
        "Microsoft 365, SQL, helpdesk support. CompTIA A+ certified. 3 years experience."
    )
    leaver = "Matric certificate. Customer service and communication skills."
    g = client.post("/match", json={"cv_text": grad, "job_text": JOB_WITH_REQS}).json()
    l = client.post("/match", json={"cv_text": leaver, "job_text": JOB_WITH_REQS}).json()
    assert g["match_percent"] > l["match_percent"]


def test_degree_satisfies_matric_requirement(client):
    """Regression: a BSc holder must never be told they are 'missing matric'."""
    cv = "BSc Information Technology degree from CUT."
    r = client.post("/match", json={"cv_text": cv, "job_text": JOB_WITH_REQS}).json()
    assert "matric" not in r["missing"]
    assert "grade 12" not in r["missing"]


def test_matric_and_grade_12_are_treated_as_one_credential(client):
    """Regression: the same CV must not show 'matric ✓' and 'grade 12 ✗'."""
    r = client.post("/match", json={"cv_text": "Matric certificate.", "job_text": JOB_WITH_REQS}).json()
    assert "matric" in r["matched"] and "grade 12" in r["matched"]
    assert "matric" not in r["missing"] and "grade 12" not in r["missing"]


def test_match_returns_zero_when_posting_states_no_requirements(client):
    r = client.post("/match", json={"cv_text": "Anything", "job_text": "We are hiring."}).json()
    assert r["match_percent"] == 0
    assert r["matched"] == [] and r["missing"] == []


# --- Explainability additions ---------------------------------------------


def test_red_flag_grid_covers_all_categories_both_states(client):
    scam = _score(client, SCAM_CLASSIC)
    clean = _score(client, LEGIT_IT_HELPDESK)
    assert len(scam["red_flags"]) == len(features.RED_FLAG_CATEGORIES)
    assert any(f["detected"] for f in scam["red_flags"])
    assert all(not f["detected"] for f in clean["red_flags"])
    # A detected flag must quote real evidence the user can find in the text.
    for f in scam["red_flags"]:
        if f["detected"]:
            assert f["evidence"] and f["evidence"].lower() in SCAM_CLASSIC.lower()


def test_positive_signals_present_for_clean_posting(client):
    clean = _score(client, LEGIT_IT_HELPDESK)
    assert clean["positive_signals"], "a clean posting must show what lowers its risk"
    assert all(s["points"] < 0 for s in clean["positive_signals"])


def test_ai_confidence_is_computed_not_hardcoded(client):
    """Confidence must vary with the evidence, in both directions."""
    clean = _score(client, LEGIT_IT_HELPDESK)
    scam = _score(client, SCAM_CLASSIC)
    vague = _score(client, "We are hiring. Contact us.")
    for r in (clean, scam, vague):
        assert 0 <= r["ai_confidence"] <= 100
    # Strong evidence either way must beat a near-empty posting.
    assert scam["ai_confidence"] > vague["ai_confidence"]
    assert clean["ai_confidence"] > vague["ai_confidence"]


# --- Input validation & limits -------------------------------------------


def test_oversized_text_is_rejected(client):
    resp = client.post("/score", json={"text": "x" * (MAX_TEXT_CHARS + 1)})
    assert resp.status_code == 422


def test_non_string_text_is_rejected(client):
    assert client.post("/score", json={"text": 12345}).status_code == 422
    assert client.post("/score", json={}).status_code == 422


def test_empty_text_is_handled_without_error(client):
    result = _score(client, "")
    assert result["tier"] == "LOW"


# --- Reporting ------------------------------------------------------------


def test_report_roundtrip_and_invalid_category_coerced(client):
    url = "https://example.test/viewjob?jk=pytest-fixture"
    before = client.get("/report-stats", params={"url": url, "domain": "example.test"}).json()

    resp = client.post(
        "/report",
        json={
            "url": url,
            "domain": "example.test",
            "category": "<script>alert(1)</script>",  # not in the whitelist
            "excerpt": "test excerpt",
            "score": 90,
        },
    )
    assert resp.status_code == 200
    after = resp.json()

    assert after["posting_reports"] == before["posting_reports"] + 1
    # Unknown categories must be coerced to "other", never stored verbatim --
    # this is what stops an injected string reaching the DB or the UI.
    assert after["top_category"] == "other"
    assert after["top_category"] in reports.SCAM_CATEGORIES


def test_report_score_out_of_range_rejected(client):
    resp = client.post("/report", json={"url": "https://x.test", "score": 9999})
    assert resp.status_code == 422


def test_report_stats_zero_state(client):
    stats = client.get(
        "/report-stats", params={"url": "https://never-reported.test/x", "domain": "never-reported.test"}
    ).json()
    assert stats["posting_reports"] == 0
    assert stats["domain_reports"] == 0
    assert stats["top_category"] is None


# --- Health ---------------------------------------------------------------


def test_health_reports_real_model_name(client):
    data = client.get("/health").json()
    assert data["status"] == "ok"
    assert data["model_loaded"] is True
    # Must reflect the actual loaded estimator, not a hardcoded string.
    assert data["model_name"] == "RandomForestClassifier"
