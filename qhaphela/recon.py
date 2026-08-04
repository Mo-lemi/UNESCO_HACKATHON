"""
Passive reconnaissance on the employer details a posting actually contains.

"Passive" is meant strictly: everything here is either computed locally from
the posting text, or read from public infrastructure records (DNS, RDAP, the
TLS certificate a server already presents). Nothing probes the employer, and
nothing is scraped from LinkedIn or any site's private surface.

THE RULE THIS MODULE EXISTS TO OBEY
-----------------------------------
Never fabricate a finding, and never call a company fraudulent.

Every check returns one of three states, and "unknown" is a first-class
answer rather than something to paper over:

    verified  - we looked, and found positive evidence
    warning   - we looked, and found something worth a person's attention
    unknown   - we could not check, or the answer was inconclusive

A missing MX record is reported as "this domain cannot receive email", which
is a fact. It is never reported as "this employer is fake", which is a
conclusion we have no basis for. Plenty of legitimate small South African
employers have thin infrastructure; that is exactly the population this
project has been careful not to punish.

There is deliberately NO trust score out of 100. A number like "78/100"
implies a precision these checks cannot support, and inventing one would be
the same failure as a risk score implying evidence that does not exist.
Callers get counts of passed / concerns / unchecked instead.

Nothing here requires an API key, an account, or a paid service.
"""

import json
import re
import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# Bounded so a slow resolver cannot hold up a request a person is waiting on.
DNS_TIMEOUT = 4
RDAP_TIMEOUT = 5
TLS_TIMEOUT = 4

USER_AGENT = "Qhaphela/0.1 (job-fraud-detection)"

# ---- Local knowledge ----------------------------------------------------

FREE_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.za", "outlook.com",
    "hotmail.com", "hotmail.co.za", "live.com", "aol.com", "icloud.com",
    "mail.com", "protonmail.com", "proton.me", "webmail.co.za", "vodamail.co.za",
    "mweb.co.za", "telkomsa.net", "yandex.com", "zoho.com", "gmx.com",
}

# Domains that exist only to receive throwaway mail. A recruiter using one is
# not contactable afterwards, which matters more than whether it is a "scam".
DISPOSABLE_EMAIL_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
    "throwawaymail.com", "yopmail.com", "trashmail.com", "sharklasers.com",
    "getnada.com", "temp-mail.org", "fakeinbox.com", "dispostable.com",
}

# TLDs with a documented history of abuse and near-zero registration cost.
# Presence is a prompt to verify, never a verdict -- legitimate businesses do
# use them.
HIGH_ABUSE_TLDS = {
    "top", "xyz", "click", "icu", "work", "gq", "cf", "ml", "tk", "ga",
    "buzz", "rest", "cyou", "sbs", "quest", "monster",
}

# Link shorteners hide the true destination, which is the point of using one
# in a recruitment message.
URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly",
    "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "tiny.cc", "bl.ink",
}

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})")
URL_RE = re.compile(r"https?://([A-Za-z0-9.\-]+\.[A-Za-z]{2,})(?:[/?#][^\s]*)?", re.I)

# South African mobile prefixes, used to tell a real cell number from a
# made-up one. Landline area codes are separate and not treated as suspicious.
SA_MOBILE_PREFIXES = {
    "060", "061", "062", "063", "064", "065", "066", "067", "068", "069",
    "071", "072", "073", "074", "076", "078", "079",
    "081", "082", "083", "084",
}
PHONE_RE = re.compile(r"(?:\+27|0)\s?(\d{2})\s?(\d{3})\s?(\d{4})")


def _finding(key, state, label, detail, evidence="", how=""):
    """
    One check result.

    `how` records the method, so a person can repeat the check themselves
    rather than having to take our word for it.
    """
    return {
        "key": key,
        "state": state,  # verified | warning | unknown
        "label": label,
        "detail": detail,
        "evidence": evidence,
        "how": how,
    }


# ---- Network helpers ----------------------------------------------------


def _http_json(url, timeout, accept="application/json"):
    """GET JSON, returning None on any failure. Never raises to the caller."""
    req = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": accept}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, urllib.error.HTTPError, socket.timeout,
            json.JSONDecodeError, ValueError, OSError):
        return None


def _dns(domain, rtype):
    """
    Resolve a record over DNS-over-HTTPS.

    Cloudflare's resolver speaks plain JSON over HTTPS, so this needs no DNS
    library and no credentials. Returns a list of record strings, or None
    when the lookup itself failed -- which is different from "no records
    exist", and the caller must keep that distinction.
    """
    url = (
        "https://cloudflare-dns.com/dns-query?name="
        + urllib.parse.quote(domain)
        + "&type="
        + rtype
    )
    data = _http_json(url, DNS_TIMEOUT, accept="application/dns-json")
    if data is None:
        return None
    return [a.get("data", "") for a in (data.get("Answer") or [])]


# ---- Individual checks --------------------------------------------------


def check_domain_resolves(domain):
    records = _dns(domain, "A")
    if records is None:
        return _finding("resolves", "unknown", "Domain resolves",
                        "Could not complete the lookup.", domain, "DNS A record")
    if records:
        return _finding("resolves", "verified", "Domain resolves",
                        "This domain exists and points to a server.",
                        domain, "DNS A record")
    return _finding("resolves", "warning", "Domain resolves",
                    "No address record found. The domain may not host a website.",
                    domain, "DNS A record")


def check_mail_exchange(domain):
    """
    Whether the domain can receive email at all.

    This is one of the more useful checks available for free: a recruiter
    address on a domain with no MX record cannot receive your reply, which
    tells you something concrete regardless of intent.
    """
    records = _dns(domain, "MX")
    if records is None:
        return _finding("mx", "unknown", "Can receive email",
                        "Could not complete the lookup.", domain, "DNS MX record")
    if records:
        return _finding("mx", "verified", "Can receive email",
                        "Mail servers are published for this domain.",
                        "; ".join(records[:2])[:120], "DNS MX record")
    return _finding("mx", "warning", "Can receive email",
                    "No mail server is published, so this domain cannot receive email.",
                    domain, "DNS MX record")


def check_spf(domain):
    records = _dns(domain, "TXT")
    if records is None:
        return _finding("spf", "unknown", "Sender policy (SPF)",
                        "Could not complete the lookup.", domain, "DNS TXT record")
    spf = [r for r in records if "v=spf1" in r.lower()]
    if spf:
        return _finding("spf", "verified", "Sender policy (SPF)",
                        "The domain publishes which servers may send its email.",
                        spf[0][:120], "DNS TXT record containing v=spf1")
    return _finding("spf", "warning", "Sender policy (SPF)",
                    "No SPF record, so anyone can forge email from this domain.",
                    domain, "DNS TXT record containing v=spf1")


def check_dmarc(domain):
    records = _dns("_dmarc." + domain, "TXT")
    if records is None:
        return _finding("dmarc", "unknown", "Anti-spoofing policy (DMARC)",
                        "Could not complete the lookup.", domain,
                        "DNS TXT record at _dmarc.<domain>")
    dmarc = [r for r in records if "v=dmarc1" in r.lower()]
    if dmarc:
        return _finding("dmarc", "verified", "Anti-spoofing policy (DMARC)",
                        "The domain tells mail providers how to handle forged email.",
                        dmarc[0][:120], "DNS TXT record at _dmarc.<domain>")
    return _finding("dmarc", "warning", "Anti-spoofing policy (DMARC)",
                    "No DMARC policy, so forged email from this domain is harder to stop.",
                    domain, "DNS TXT record at _dmarc.<domain>")


def check_registration(domain):
    """
    Domain age and status via RDAP -- the public successor to WHOIS.

    Age matters because fraudulent recruitment domains are typically days or
    weeks old. It is evidence, not proof: real businesses register new
    domains every day, so a young domain is reported as a reason to verify.

    RDAP coverage is uneven. Several registries, including .co.za, do not
    serve it publicly, so "unknown" here is common and completely normal --
    it must never be presented as though it were a negative finding.
    """
    data = _http_json("https://rdap.org/domain/" + urllib.parse.quote(domain), RDAP_TIMEOUT)
    if not data:
        return [
            _finding("domain_age", "unknown", "Domain age",
                     "No public registration record available for this domain. "
                     "Many South African (.co.za) domains do not publish one, "
                     "so this is not itself a concern.",
                     domain, "RDAP registration lookup")
        ]

    out = []
    registered = None
    for event in data.get("events") or []:
        if event.get("eventAction") == "registration":
            registered = event.get("eventDate")
            break

    if registered:
        try:
            when = datetime.fromisoformat(registered.replace("Z", "+00:00"))
            days = (datetime.now(timezone.utc) - when).days
            shown = when.date().isoformat()
            if days < 90:
                out.append(_finding(
                    "domain_age", "warning", "Domain age",
                    f"Registered {days} days ago ({shown}). Very new domains are "
                    "common in recruitment fraud, though new businesses are real too.",
                    shown, "RDAP registration date"))
            else:
                years = days // 365
                age = f"{years} year{'s' if years != 1 else ''}" if years else f"{days} days"
                out.append(_finding(
                    "domain_age", "verified", "Domain age",
                    f"Registered {age} ago ({shown}), which is consistent with an "
                    "established organisation.",
                    shown, "RDAP registration date"))
        except (ValueError, TypeError):
            out.append(_finding("domain_age", "unknown", "Domain age",
                                "Registration date could not be read.", "",
                                "RDAP registration date"))
    else:
        out.append(_finding("domain_age", "unknown", "Domain age",
                            "No registration date published.", domain,
                            "RDAP registration date"))

    # Registry status codes that indicate a domain in trouble.
    statuses = [str(s).lower() for s in (data.get("status") or [])]
    bad = [s for s in statuses if any(f in s for f in ("hold", "pending delete", "suspended"))]
    if bad:
        out.append(_finding("domain_status", "warning", "Registry status",
                            "The registry has flagged this domain: " + ", ".join(bad),
                            ", ".join(bad)[:120], "RDAP status field"))
    return out


def check_tls(domain):
    """
    Read the certificate the server already presents.

    This is a normal HTTPS connection, the same one a browser makes, so it
    reveals nothing the site does not publish to every visitor.
    """
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((domain, 443), timeout=TLS_TIMEOUT) as sock:
            with ctx.wrap_socket(sock, server_hostname=domain) as tls:
                cert = tls.getpeercert()
    except ssl.SSLCertVerificationError as exc:
        return _finding("tls", "warning", "Website certificate",
                        f"The certificate did not validate ({exc.verify_message}). "
                        "Do not enter personal details on this site.",
                        domain, "TLS handshake on port 443")
    except (socket.timeout, socket.gaierror, ConnectionError, OSError):
        return _finding("tls", "unknown", "Website certificate",
                        "Could not connect over HTTPS to check.", domain,
                        "TLS handshake on port 443")

    issuer = ""
    for part in cert.get("issuer", ()):
        for k, v in part:
            if k == "organizationName":
                issuer = v
    return _finding("tls", "verified", "Website certificate",
                    "The site presents a valid HTTPS certificate"
                    + (f", issued by {issuer}." if issuer else "."),
                    issuer or domain, "TLS handshake on port 443")


# ---- Purely local checks (no network, always available) -----------------


def _levenshtein(a, b):
    """Small local edit distance, used only for lookalike-domain detection."""
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def local_checks(text, company_name, email_domain):
    """
    Everything computable from the posting alone.

    These need no network, so they still work offline and cannot be defeated
    by a lookup failing.
    """
    out = []
    lower = (text or "").lower()

    if email_domain:
        base = email_domain.lower()
        tld = base.rsplit(".", 1)[-1] if "." in base else ""

        if base in DISPOSABLE_EMAIL_DOMAINS:
            out.append(_finding("disposable", "warning", "Throwaway email address",
                                "This is a temporary email service. The address will stop "
                                "working, so the sender cannot be contacted or held to anything.",
                                base, "Matched against a list of disposable mail providers"))
        elif base in FREE_EMAIL_DOMAINS:
            out.append(_finding("free_email", "warning", "Recruiter email domain",
                                "A free personal email provider, not a company address. "
                                "Common for small employers, but it proves nothing about "
                                "who they are.",
                                base, "Email domain compared to known free providers"))
        else:
            out.append(_finding("company_email", "verified", "Recruiter email domain",
                                "The recruiter uses an organisation domain rather than a "
                                "free personal address.",
                                base, "Email domain is not a known free provider"))

        if tld in HIGH_ABUSE_TLDS:
            out.append(_finding("tld", "warning", "Domain ending",
                                f'".{tld}" domains are very cheap and heavily used in fraud. '
                                "Legitimate businesses do use them, so verify rather than assume.",
                                "." + tld, "Domain ending compared to high-abuse list"))

        # Punycode is how a domain impersonates another using characters that
        # merely look identical.
        if base.startswith("xn--") or ".xn--" in base:
            out.append(_finding("homoglyph", "warning", "Lookalike characters",
                                "This domain uses non-Latin characters that can be made to "
                                "look like an ordinary name. This is a known impersonation "
                                "technique.",
                                base, "Domain contains a punycode (xn--) label"))

        # Lookalike of the company being advertised.
        if company_name:
            cn = _norm(company_name)
            dn = _norm(base.rsplit(".", 2)[0] if base.count(".") >= 2 else base.split(".")[0])
            if cn and dn and len(cn) > 3:
                dist = _levenshtein(cn, dn)
                # Order matters, and getting it wrong is dangerous. Testing
                # substring containment first would let "tharisas" match
                # "tharisa" and earn a green tick -- which is exactly the
                # typosquat an impersonator registers. Exact match first,
                # then near-miss, and only then containment.
                if dist == 0:
                    out.append(_finding("domain_match", "verified", "Email matches the company",
                                        "The email domain matches the company named in the posting.",
                                        f"{company_name} / {base}",
                                        "Company name compared to the email domain"))
                elif dist <= 2:
                    out.append(_finding("lookalike", "warning", "Near-miss domain",
                                        "The email domain is very close to the company name but "
                                        "not identical. Impersonators register near-miss domains "
                                        "deliberately. Check the spelling character by character.",
                                        f"{company_name} vs {base}",
                                        "Edit distance between company name and domain"))
                elif cn in dn or dn in cn:
                    # A genuine longer form, e.g. "tharisaminerals" for
                    # "tharisa". Only reached once a near-miss is ruled out.
                    out.append(_finding("domain_match", "verified", "Email matches the company",
                                        "The email domain matches the company named in the posting.",
                                        f"{company_name} / {base}",
                                        "Company name compared to the email domain"))
                else:
                    out.append(_finding("domain_match", "warning", "Email matches the company",
                                        "The email domain does not match the company named in "
                                        "the posting. This is normal when an agency recruits, "
                                        "but worth confirming.",
                                        f"{company_name} / {base}",
                                        "Company name compared to the email domain"))

    # Link shorteners conceal the destination.
    hosts = {h.lower() for h in URL_RE.findall(text or "")}
    shorteners = sorted(hosts & URL_SHORTENERS)
    if shorteners:
        out.append(_finding("shortener", "warning", "Shortened links",
                            "This posting uses a link shortener, which hides where the link "
                            "actually goes. Do not sign in or enter details through it.",
                            ", ".join(shorteners), "Links compared to known shortener hosts"))

    # Phone plausibility.
    for m in PHONE_RE.finditer(text or ""):
        prefix = "0" + m.group(1) if not m.group(0).startswith("+27") else "0" + m.group(1)
        if prefix not in SA_MOBILE_PREFIXES and not prefix.startswith(("01", "02", "03", "04", "05")):
            out.append(_finding("phone", "warning", "Contact number",
                                f"{m.group(0)} is not a recognised South African number format.",
                                m.group(0), "Prefix compared to allocated SA ranges"))
            break

    if "whatsapp" in lower and not EMAIL_RE.search(text or ""):
        out.append(_finding("whatsapp_only", "warning", "WhatsApp is the only contact",
                            "There is no email address, only WhatsApp. Real employers keep a "
                            "written trail you can refer back to.",
                            "WhatsApp", "Posting text contains WhatsApp and no email address"))

    return out


# ---- Orchestration ------------------------------------------------------


def extract_contacts(text):
    """Pull the email domains and website hosts the posting actually states."""
    email_domains, seen = [], set()
    for d in EMAIL_RE.findall(text or ""):
        d = d.lower().rstrip(".")
        if d not in seen:
            seen.add(d)
            email_domains.append(d)
    hosts = []
    for h in URL_RE.findall(text or ""):
        h = h.lower().lstrip("www.")
        if h not in hosts and h not in URL_SHORTENERS:
            hosts.append(h)
    return email_domains, hosts


def verify_employer(text, company_name="", do_network=True):
    """
    Run every available check and return structured evidence.

    Returns counts rather than a score. "3 passed, 2 concerns, 1 unchecked"
    is something a person can act on and audit; "trust 78%" is a number we
    would be making up.
    """
    email_domains, hosts = extract_contacts(text)
    email_domain = email_domains[0] if email_domains else ""

    findings = local_checks(text, company_name, email_domain)

    # Never run employer infrastructure checks against a free or throwaway
    # provider. Checking gmail.com returns "registered 1995, valid SPF, valid
    # certificate" -- all true, all about Google, and none of it evidence
    # about the employer. Presenting those as passed checks beside a scam
    # advert would actively reassure someone. If the recruiter uses a free
    # address, the honest answer is that there is no company domain to check.
    is_free = email_domain in FREE_EMAIL_DOMAINS or email_domain in DISPOSABLE_EMAIL_DOMAINS
    primary = "" if is_free else email_domain
    if not primary and hosts:
        primary = hosts[0]

    if is_free and not primary:
        findings.append(_finding(
            "no_company_domain", "warning", "No company domain to verify",
            "The recruiter uses a free email provider and the posting links to no "
            "company website, so there is no employer domain to check. Nothing here "
            "can confirm who they are. Ask for an email on the company's own domain.",
            email_domain, "No verifiable employer domain present in the posting"))

    if do_network and primary:
        findings.append(check_domain_resolves(primary))
        findings.append(check_mail_exchange(primary))
        findings.append(check_spf(primary))
        findings.append(check_dmarc(primary))
        findings.extend(check_registration(primary))
        findings.append(check_tls(primary))
    elif not primary and not is_free:
        findings.append(_finding(
            "no_contact", "warning", "No contact details",
            "This posting states no email address and no company website, so there "
            "is nothing to verify. Ask for an official company email before sending "
            "anything personal.",
            "", "Searched the posting text for emails and links"))

    counts = {
        "verified": sum(1 for f in findings if f["state"] == "verified"),
        "warning": sum(1 for f in findings if f["state"] == "warning"),
        "unknown": sum(1 for f in findings if f["state"] == "unknown"),
    }
    return {
        "domain_checked": primary,
        "email_domains": email_domains[:5],
        "websites": hosts[:5],
        "findings": findings,
        "counts": counts,
        "caveat": (
            "These are infrastructure and text checks only. They cannot prove a "
            "company is real or fraudulent, and no company registry (CIPC) is "
            "queried. Always verify an employer through their official website "
            "or switchboard before sharing anything personal."
        ),
    }
