"""
Local community-report storage for Qhaphela.

Scope note, deliberately explicit: this is a *local, single-machine* store
backed by SQLite. It is a working proof-of-concept for the community
reporting loop described in the design docs, not a deployed multi-user
service -- there is no shared server, so "community" counts here only ever
reflect reports made on this machine. Counts are surfaced in the UI only
when genuinely non-zero, and never presented as if they came from other
users.

Privacy (POPIA-relevant): reports store a SHA-256 hash of the posting URL
and a short excerpt of the posting text, never anything about the reporter.
No user identifier, IP, or browser fingerprint is collected or stored.
"""

import hashlib
import os
import re
import sqlite3
import threading
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "reports.db")

# Fixed category list -- keeps the data analysable and avoids storing
# free-text the user might accidentally paste personal information into.
SCAM_CATEGORIES = [
    "asked_for_documents",
    "asked_for_payment",
    "fake_company",
    "whatsapp_only",
    "unrealistic_salary",
    "other",
]

_lock = threading.Lock()

# Anonymisation before storage, per the research protocol's ethics section:
# "No personal or sensitive information such as identity numbers, contact
# details or emails will be disclosed and all data will be anonymised during
# preprocessing." A reported posting can contain a victim's own details
# pasted into it, or a scammer's harvesting instructions -- neither belongs
# in a stored excerpt.
_SA_ID_RE = re.compile(r"\b\d{13}\b")                       # SA ID number
_PHONE_RE_PII = re.compile(r"\b0[6-8]\d[\s-]?\d{3}[\s-]?\d{4}\b")
_EMAIL_RE_PII = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_ACCOUNT_RE = re.compile(r"\b\d{9,12}\b")                   # bank account-ish runs


def anonymise(text: str) -> str:
    """Strip identifiers from an excerpt before it is ever written to disk."""
    if not text:
        return ""
    text = _SA_ID_RE.sub("[ID REMOVED]", text)
    text = _EMAIL_RE_PII.sub("[EMAIL REMOVED]", text)
    text = _PHONE_RE_PII.sub("[PHONE REMOVED]", text)
    text = _ACCOUNT_RE.sub("[NUMBER REMOVED]", text)
    return text


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _lock, _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url_hash TEXT NOT NULL,
                domain TEXT,
                category TEXT NOT NULL,
                excerpt TEXT,
                score INTEGER,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_reports_url_hash ON reports(url_hash)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_reports_domain ON reports(domain)")


def hash_url(url: str) -> str:
    return hashlib.sha256((url or "").strip().lower().encode("utf-8")).hexdigest()


def add_report(url: str, domain: str, category: str, excerpt: str, score: int) -> dict:
    if category not in SCAM_CATEGORIES:
        category = "other"
    url_hash = hash_url(url)
    # Capped hard, then anonymised: enough to recognise the posting later,
    # never enough to retain someone's identity documents or contact details.
    excerpt = anonymise((excerpt or "")[:300])
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO reports (url_hash, domain, category, excerpt, score, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (url_hash, domain, category, excerpt, score, datetime.now(timezone.utc).isoformat()),
        )
    return stats_for(url, domain)


def stats_for(url: str, domain: str) -> dict:
    """
    Report counts for one posting and its domain. Zero is a valid answer.

    Self-heals if the database file is missing or the table has not been
    created yet: reporting is a secondary feature and must never be able to
    take down fraud scoring, which is the part that actually protects people.
    """
    init_db()
    url_hash = hash_url(url)
    with _lock, _connect() as conn:
        posting_count = conn.execute(
            "SELECT COUNT(*) AS c FROM reports WHERE url_hash = ?", (url_hash,)
        ).fetchone()["c"]
        domain_count = (
            conn.execute(
                "SELECT COUNT(*) AS c FROM reports WHERE domain = ?", (domain,)
            ).fetchone()["c"]
            if domain
            else 0
        )
        top_category_row = conn.execute(
            "SELECT category, COUNT(*) AS c FROM reports WHERE url_hash = ?"
            " GROUP BY category ORDER BY c DESC LIMIT 1",
            (url_hash,),
        ).fetchone()
    return {
        "posting_reports": posting_count,
        "domain_reports": domain_count,
        "top_category": top_category_row["category"] if top_category_row else None,
    }


def total_reports() -> int:
    init_db()
    with _lock, _connect() as conn:
        return conn.execute("SELECT COUNT(*) AS c FROM reports").fetchone()["c"]
