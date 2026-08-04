"""
Synthetic training corpus for hackathon prototyping.

This is NOT scraped or real data. It stands in for the real corpus described
in the research proposal (EMSCAD + scraped/crowdsourced South African
postings), so the pipeline in train.py can be built and demoed before that
real corpus exists. Every posting is template-generated and clearly synthetic
-- do not present this file's output as real evidence in the hackathon
submission or the underlying research.
"""

import csv
import os
import random

random.seed(42)

HERE = os.path.dirname(os.path.abspath(__file__))

ROLES = [
    "Data Capturer", "Administrator", "Call Centre Agent", "Warehouse Assistant",
    "Cashier", "Receptionist", "General Worker", "Driver", "Cleaner",
    "IT Support Technician", "HR Assistant", "Sales Representative",
    "Software Developer", "Accountant", "Security Officer",
]

# Rough monthly ZAR market bands used later by features.py for the mismatch check
ROLE_SALARY_BAND = {
    "Data Capturer": (6000, 12000),
    "Administrator": (7000, 14000),
    "Call Centre Agent": (6500, 12000),
    "Warehouse Assistant": (5500, 9000),
    "Cashier": (5000, 8500),
    "Receptionist": (6000, 11000),
    "General Worker": (4500, 8000),
    "Driver": (6000, 11000),
    "Cleaner": (4200, 7000),
    "IT Support Technician": (10000, 20000),
    "HR Assistant": (8000, 15000),
    "Sales Representative": (7000, 15000),
    "Software Developer": (18000, 45000),
    "Accountant": (14000, 28000),
    "Security Officer": (5000, 9000),
}

CITIES = ["Johannesburg", "Pretoria", "Durban", "Cape Town", "Bloemfontein",
          "Polokwane", "Nelspruit", "Kimberley", "Gqeberha", "Midrand"]

LEGIT_COMPANY_SUFFIX = ["(Pty) Ltd", "Group", "Solutions", "Holdings", "Logistics", "Retail"]


def _legit_company(i):
    return f"{random.choice(['Thandeka','Karabo','Sizwe','Lerato','Mpho','Nomvula','Vuyo'])} " \
           f"{random.choice(LEGIT_COMPANY_SUFFIX)} {i}"


# Several phrasing options per clause so legitimate postings don't share a
# single fixed boilerplate -- otherwise a classifier can shortcut on "does
# this match the legit template" instead of learning genuine fraud signals.
_OPENERS = [
    "{company} is recruiting a {role} based in {city}.",
    "We're looking for a {role} to join {company} in {city}.",
    "{company} has a vacancy for a {role} in the {city} area.",
    "A {role} position is now open at {company}, {city}.",
]
_SALARY_LINES = [
    "Salary offered is R{salary} per month, negotiable based on experience.",
    "The role pays R{salary}/month depending on relevant experience.",
    "Remuneration is R{salary} per month, in line with industry norms.",
]
_DUTY_LINES = [
    "Duties include general {role_lower} responsibilities as outlined in the attached job description.",
    "Responsibilities cover the standard scope of a {role_lower} role at this level.",
    "The successful candidate will handle day-to-day {role_lower} tasks for the team.",
]
_REQUIREMENT_LINES = [
    "Minimum requirement: Matric certificate, relevant experience preferred.",
    "Candidates should have a Grade 12 qualification and some relevant work history.",
    "A completed Matric and prior experience in a similar role is preferred.",
]
_APPLY_LINES = [
    "To apply, submit your CV via our official careers page at careers.{domain}.",
    "Interested candidates can send a CV through our listing on {board}.",
    "Please apply directly through {board} with an updated CV.",
]
_CLOSE_LINES = [
    "Shortlisted candidates will be contacted for an interview within two weeks. No fees of any kind are charged during recruitment.",
    "Only shortlisted applicants will be contacted. This process is entirely free of charge to candidates.",
    "We do not charge any fee at any stage of hiring. Shortlisted candidates hear back within ten working days.",
]
JOB_BOARDS = ["Pnet", "Careers24", "Indeed", "our LinkedIn page"]


def make_legit_posting(i):
    role = random.choice(ROLES)
    lo, hi = ROLE_SALARY_BAND[role]
    salary = random.randint(lo, hi)
    city = random.choice(CITIES)
    company = _legit_company(i)
    domain = company.lower().replace(" ", "").replace("(pty)ltd", "") + ".co.za"

    parts = [
        random.choice(_OPENERS).format(company=company, role=role, city=city),
        random.choice(_SALARY_LINES).format(salary=salary),
        random.choice(_DUTY_LINES).format(role_lower=role.lower()),
        random.choice(_REQUIREMENT_LINES),
        random.choice(_APPLY_LINES).format(domain=domain, board=random.choice(JOB_BOARDS)),
        random.choice(_CLOSE_LINES),
    ]
    text = " ".join(parts)
    return text, 0


FRAUD_TEMPLATES = [
    lambda role, city, salary, wa: (
        f"URGENT! {role} needed in {city}, R{salary}/month, no experience necessary! "
        f"Only 5 slots left, apply within 24 hours. WhatsApp us now on {wa} to secure your spot. "
        f"In compliance with POPIA we require a copy of your ID and proof of banking details "
        f"to begin your pre-employment screening immediately."
    ),
    lambda role, city, salary, wa: (
        f"We are a proud Level 1 B-BBEE contributor urgently hiring a {role} in {city} "
        f"paying R{salary} per month. No interview required, immediate start. "
        f"Send your ID number, ID document and bank account details to our WhatsApp "
        f"line {wa} today to reserve your position -- limited spaces available!"
    ),
    lambda role, city, salary, wa: (
        f"{role} position available, {city}, R{salary}/month, apply today! "
        f"A small registration fee is required to process your onboarding pack. "
        f"Kindly WhatsApp {wa} with your full ID number and banking details for verification "
        f"as per our POPIA data policy. Act fast, this offer closes tonight!"
    ),
    lambda role, city, salary, wa: (
        f"{role} vacancy in {city}, R{salary} a month. WhatsApp {wa} if interested, "
        f"only a few spots remain so don't delay your application."
    ),
    lambda role, city, salary, wa: (
        f"Immediate opening for a {role} in {city}. To finalise your placement we require "
        f"your ID number and banking details for the onboarding file. Reply as soon as possible, "
        f"positions are filling up fast."
    ),
    lambda role, city, salary, wa: (
        f"{role} needed, {city} area, R{salary}/month. Kindly note a refundable registration "
        f"deposit is required before your starter pack is issued. Limited spaces, apply now."
    ),
]

FREE_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com"]


def make_fraud_posting(i):
    role = random.choice(ROLES)
    lo, hi = ROLE_SALARY_BAND[role]
    # inflate salary well above the legitimate band to create a mismatch signal
    salary = int(hi * random.uniform(1.8, 3.2))
    city = random.choice(CITIES)
    wa = f"0{random.randint(60,84)}{random.randint(1000000,9999999)}"
    template = random.choice(FRAUD_TEMPLATES)
    text = template(role, city, salary, wa)
    return text, 1


def build(n_legit=750, n_fraud=35, out_path=None):
    if out_path is None:
        out_path = os.path.join(HERE, "synthetic_postings.csv")
    rows = []
    for i in range(n_legit):
        text, label = make_legit_posting(i)
        rows.append((text, label))
    for i in range(n_fraud):
        text, label = make_fraud_posting(i)
        rows.append((text, label))
    random.shuffle(rows)

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["text", "label"])
        writer.writerows(rows)

    fraud_pct = 100 * n_fraud / (n_legit + n_fraud)
    print(f"Wrote {len(rows)} synthetic postings to {out_path} "
          f"({n_fraud} fraud / {n_legit} legit, {fraud_pct:.1f}% fraud rate).")
    print("Reminder: this is a synthetic stand-in corpus, not real scraped or EMSCAD data.")


if __name__ == "__main__":
    build()
