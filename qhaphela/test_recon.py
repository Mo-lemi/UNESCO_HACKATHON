"""
Tests for the passive verification engine.

Network calls are stubbed. These tests are about our own logic -- what we
conclude from a given set of records -- which must hold identically whether
or not a resolver is reachable.

Two of these guard bugs that were caught in live testing, and both had the
same shape: a scam posting being shown reassuring green ticks. That is the
worst failure this module can have, so they are pinned here permanently.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import recon


@pytest.fixture
def no_network(monkeypatch):
    """Every lookup fails, so only the local text checks run."""
    monkeypatch.setattr(recon, "_dns", lambda d, t: None)
    monkeypatch.setattr(recon, "_http_json", lambda *a, **k: None)
    monkeypatch.setattr(
        recon, "check_tls",
        lambda d: recon._finding("tls", "unknown", "Website certificate", "stubbed",
                                 d, "TLS handshake on port 443"),
    )


def states(report, key):
    return [f["state"] for f in report["findings"] if f["key"] == key]


# ---- Regression: free providers must not be "verified" -----------------


def test_free_provider_domain_is_never_infrastructure_checked(monkeypatch):
    """
    Checking gmail.com returns registered-1995, valid SPF, valid certificate.
    All true, all about Google, none of it evidence about the employer.
    Showing those as passed checks beside a scam advert actively reassures
    the person the tool exists to protect.
    """
    called = []
    monkeypatch.setattr(recon, "_dns", lambda d, t: called.append(d) or ["stub"])
    monkeypatch.setattr(recon, "_http_json", lambda *a, **k: None)
    monkeypatch.setattr(
        recon, "check_tls",
        lambda d: called.append(d) or recon._finding("tls", "verified", "cert", "ok"),
    )

    report = recon.verify_employer(
        "Send your ID to tharisa.hr2026@gmail.com to apply.", "Tharisa Minerals"
    )

    assert report["domain_checked"] == "", "a free provider must not become the checked domain"
    assert not any("gmail.com" in c for c in called), "no lookup may run against the free provider"
    assert report["counts"]["verified"] == 0, "a free-provider posting must earn no green ticks"
    assert any(f["key"] == "no_company_domain" for f in report["findings"])


def test_disposable_provider_is_flagged_and_not_checked(monkeypatch):
    monkeypatch.setattr(recon, "_dns", lambda d, t: pytest.fail("should not resolve"))
    monkeypatch.setattr(recon, "_http_json", lambda *a, **k: None)
    report = recon.verify_employer("Reply to hr@mailinator.com", "Acme")
    assert report["domain_checked"] == ""
    assert "warning" in states(report, "disposable")


# ---- Regression: typosquats must not be reported as a match ------------


@pytest.mark.parametrize(
    "company,domain",
    [
        ("Tharisa", "hr@tharisas.co.za"),      # one extra character
        ("Standard Bank", "jobs@standardbnk.co.za"),   # transposition
        ("Capitec", "hr@capitek.co.za"),       # substitution
    ],
)
def test_lookalike_domains_are_warned_not_matched(no_network, company, domain):
    report = recon.verify_employer(f"Email your CV to {domain}", company)
    assert "warning" in states(report, "lookalike"), f"{domain} not caught as a near-miss"
    # It must not simultaneously claim the domain matches the company.
    assert "verified" not in states(report, "domain_match")


def test_exact_and_longer_form_domains_still_match(no_network):
    """The fix must not break genuine matches, including longer forms."""
    exact = recon.verify_employer("Email careers@tharisa.com", "Tharisa")
    assert "verified" in states(exact, "domain_match")

    longer = recon.verify_employer("Email careers@tharisaminerals.com", "Tharisa")
    assert "verified" in states(longer, "domain_match")


# ---- Honesty guarantees -------------------------------------------------


def test_no_trust_score_is_ever_produced(no_network):
    """
    A number like "trust 78/100" implies precision these checks cannot
    support. Counts are auditable; an invented percentage is not.
    """
    report = recon.verify_employer("Email careers@tharisa.com", "Tharisa")
    assert "score" not in report
    assert "trust" not in report
    assert set(report["counts"]) == {"verified", "warning", "unknown"}


def test_failed_lookups_are_unknown_not_warnings(monkeypatch):
    """
    A resolver being unreachable says nothing about an employer. Reporting
    it as a concern would penalise a company for our own network trouble.
    """
    monkeypatch.setattr(recon, "_dns", lambda d, t: None)
    monkeypatch.setattr(recon, "_http_json", lambda *a, **k: None)
    monkeypatch.setattr(
        recon, "check_tls",
        lambda d: recon._finding("tls", "unknown", "Website certificate", "stubbed",
                                 d, "TLS handshake on port 443"),
    )
    report = recon.verify_employer("Email careers@realcompany.co.za", "Real Company")
    for key in ("resolves", "mx", "spf", "dmarc"):
        assert states(report, key) == ["unknown"], key


def test_every_finding_records_how_it_was_obtained(no_network):
    """A person must be able to repeat any check themselves."""
    report = recon.verify_employer(
        "Email careers@tharisa.com or visit https://bit.ly/x", "Tharisa"
    )
    for f in report["findings"]:
        assert f["how"], f"finding {f['key']} does not say how it was checked"
        assert f["state"] in ("verified", "warning", "unknown")


def test_caveat_is_always_present(no_network):
    report = recon.verify_employer("Email careers@tharisa.com", "Tharisa")
    assert "cannot prove" in report["caveat"]
    assert "CIPC" in report["caveat"]


# ---- Local signal checks -----------------------------------------------


def test_link_shortener_is_flagged(no_network):
    report = recon.verify_employer("Apply at https://bit.ly/3xFake", "Acme")
    assert "warning" in states(report, "shortener")


def test_punycode_domain_is_flagged(no_network):
    report = recon.verify_employer("Email hr@xn--thrisa-9za.com", "Tharisa")
    assert "warning" in states(report, "homoglyph")


def test_high_abuse_tld_is_flagged(no_network):
    report = recon.verify_employer("Email hr@quickjobs.xyz", "Quick Jobs")
    assert "warning" in states(report, "tld")


def test_posting_with_no_contact_details_says_so(no_network):
    report = recon.verify_employer("We are hiring a cleaner in Soweto.", "")
    assert any(f["key"] == "no_contact" for f in report["findings"])


def test_small_employer_with_company_domain_is_not_punished(no_network):
    """
    A tiny business with its own domain and no fancy DNS must not be made to
    look fraudulent. Thin infrastructure is normal for small SA employers.
    """
    report = recon.verify_employer(
        "Soweto Bakery is hiring. Email jobs@sowetobakery.co.za", "Soweto Bakery"
    )
    assert "verified" in states(report, "company_email")
    assert "verified" in states(report, "domain_match")
    assert not any(f["state"] == "warning" for f in report["findings"])
