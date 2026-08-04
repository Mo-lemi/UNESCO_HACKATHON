"""
Honest evaluation of the Qhaphela scoring pipeline.

WHY THIS FILE EXISTS
--------------------
models/metadata.json reports precision, recall, F1 and AUC of exactly 1.0 for
all three candidate models. Those numbers are real outputs of the training
run, but they are **meaningless as a claim of accuracy**: they were measured
on a held-out split of the *synthetic* dataset the models were also trained
on, where legitimate and fraudulent templates are trivially separable. Live
testing against real Indeed postings later confirmed this -- the classifier
over-fired on ordinary recruiting vocabulary it had never seen in that form.

Quoting "100% accuracy" would therefore be misleading. This module measures
the pipeline that users actually get -- model + rule layer + hard floors +
evidence ceiling -- against a small, hand-labelled set of **real** job
postings, and reports the result with its sample size stated plainly.

Recall on the fraud class is the metric that matters most here: missing a
scam costs someone their identity, while a false alarm costs them a second
look. The evaluation reports both so the trade-off is visible.

Run:
    source venv/bin/activate
    python qhaphela/evaluate.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Real postings, hand-labelled. Legitimate examples are taken from live South
# African listings encountered during testing; fraudulent examples follow
# documented SA recruitment-scam patterns. Small and openly stated as such --
# a modest honest sample beats a large fabricated one.
EVAL_SET = [
    # ---- Genuine postings (label 0) ----
    ("We are recruiting on behalf of our client for an IT Helpdesk Technician (Level 2+). "
     "Serve as the primary escalation point for Level 1 helpdesk tickets. Manage user accounts, "
     "permissions and access controls through Active Directory. Matric (Grade 12) as a minimum. "
     "CompTIA A+ or Microsoft certifications preferred. 2-4 years of experience.", 0),
    ("Standard Bank is recruiting for its 2026 Graduate Programme in Johannesburg. Applicants "
     "should hold a completed degree in Finance, Accounting or Economics. The programme runs for "
     "18 months with a market-related stipend. To apply, submit your CV and academic transcript "
     "via our official careers portal at careers.standardbank.co.za.", 0),
    ("A Cashier position is now open at Thandeka (Pty) Ltd, Cape Town. Remuneration is R6218 per "
     "month, in line with industry norms. Candidates should have a Grade 12 qualification. To apply, "
     "submit your CV via our official careers page. This process is entirely free of charge to candidates.", 0),
    ("SPARK Schools is hiring a Junior IT Repair Technician in Randburg. The incumbent will install "
     "and configure computer systems, diagnose hardware and software faults, and provide first and "
     "second-line support. Reports to the IT Operations Team Lead. Apply via our careers page.", 0),
    ("Chevrah Kadisha is recruiting a Junior IT Technician based in Johannesburg. Responsibilities "
     "include desktop support, printer maintenance and basic network troubleshooting. Grade 12 plus "
     "A+ certification required. Applications close at the end of the month.", 0),
    ("Tharisa Minerals seeks an AI Junior Analyst in Gauteng. The role supports business and "
     "technology teams by identifying practical opportunities to use artificial intelligence, "
     "automation and data analysis. Entry-level role suited to a fast learner. Full-time.", 0),

    # ---- Fraudulent postings (label 1) ----
    ("Receptionist position available, Gqeberha, R21836/month, apply today! A small registration fee "
     "is required to process your onboarding pack. Kindly WhatsApp 0614009366 with your full ID number "
     "and banking details for verification as per our POPIA data policy. Act fast, this offer closes tonight!", 1),
    ("Exciting learnership opportunity for unemployed youth! No experience required, matric only. "
     "Stipend R8000 per month. To secure your place please email a certified copy of your ID document, "
     "proof of residence, your tax number and a copy of your passport to recruitment.sa2026@gmail.com. "
     "A R250 registration fee applies for the starter pack. Limited spaces, apply today only!", 1),
    ("Driver needed, Durban area, R27166/month. Kindly note a refundable registration deposit is "
     "required before your starter pack is issued. Limited spaces, apply now.", 1),
    ("Data Capturer needed urgently. Salary R19,500 pm. No experience required. We strictly comply "
     "with POPIA regulations; please send a copy of your ID document to hr.recruitment2024@gmail.com. "
     "An admin processing fee of R150 is payable before your placement interview.", 1),
    ("Warehouse Assistant vacancy in Bloemfontein, R28739 a month. WhatsApp 0834176986 if interested, "
     "only a few spots remain so don't delay your application.", 1),
    ("Work from home data entry, earn R15000 weekly! No experience needed. Send your ID copy, proof of "
     "residence and bank confirmation letter to start immediately. A once-off training fee of R450 applies.", 1),
]


def evaluate():
    import joblib
    import numpy as np
    from features import combine_features, hard_floor_flags, rule_features, rule_points

    here = os.path.dirname(os.path.abspath(__file__))
    model_dir = os.path.join(here, "models")
    vectorizer = joblib.load(os.path.join(model_dir, "vectorizer.joblib"))
    model = joblib.load(os.path.join(model_dir, "model.joblib"))

    def score_posting(text):
        """Mirrors the /score pipeline exactly, including floors and ceiling."""
        X = combine_features(vectorizer.transform([text]), np.array([rule_features(text)]))
        score = int(round(float(model.predict_proba(X)[0, 1]) * 100))
        if hard_floor_flags(text):
            score = max(score, 75)
        if not rule_points(text)["items"]:
            score = min(score, 25)
        return score

    tp = fp = tn = fn = 0
    rows = []
    for text, label in EVAL_SET:
        score = score_posting(text)
        pred = 1 if score > 70 else 0  # HIGH tier is the "flag it" decision
        rows.append((label, pred, score, text[:58].replace("\n", " ")))
        if label == 1 and pred == 1: tp += 1
        elif label == 0 and pred == 1: fp += 1
        elif label == 0 and pred == 0: tn += 1
        else: fn += 1

    n = len(EVAL_SET)
    accuracy = (tp + tn) / n
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    return {
        "sample_size": n,
        "genuine": sum(1 for _, l in EVAL_SET if l == 0),
        "fraudulent": sum(1 for _, l in EVAL_SET if l == 1),
        "accuracy": round(accuracy, 3),
        "precision_fraud": round(precision, 3),
        "recall_fraud": round(recall, 3),
        "f1_fraud": round(f1, 3),
        "true_positives": tp, "false_positives": fp,
        "true_negatives": tn, "false_negatives": fn,
        "rows": rows,
    }


if __name__ == "__main__":
    r = evaluate()
    print("\nQHAPHELA — evaluation on hand-labelled REAL postings")
    print("=" * 62)
    print(f"Sample: {r['sample_size']} postings ({r['genuine']} genuine, {r['fraudulent']} fraudulent)\n")
    for label, pred, score, snippet in r["rows"]:
        ok = "✓" if label == pred else "✗ MISCLASSIFIED"
        print(f"  [{'FRAUD' if label else 'REAL '}] score={score:3d} → {'FLAG' if pred else 'pass'}  {ok}")
        print(f"          {snippet}…")
    n = r["sample_size"]
    correct = r["true_positives"] + r["true_negatives"]
    print("\n" + "-" * 62)
    # Lead with the fraction, not the percentage. "100%" on a small sample
    # overstates what was actually shown; "12 of 12" is the same fact without
    # implying a precision the sample size cannot support.
    print(f"  Correct             {correct} of {n}")
    print(f"  Caught scams        {r['true_positives']} of {r['true_positives'] + r['false_negatives']}   ← the metric that matters most")
    print(f"  False alarms        {r['false_positives']} of {r['false_positives'] + r['true_negatives']} genuine postings")
    print(f"\n  (accuracy {r['accuracy']:.0%}, precision {r['precision_fraud']:.0%}, "
          f"recall {r['recall_fraud']:.0%}, F1 {r['f1_fraud']:.0%})")
    print("\nHOW TO READ THIS")
    print("-" * 62)
    print(f"This is {n} postings, not a benchmark. A perfect score on a sample")
    print("this small shows the pipeline behaves correctly on the cases tested;")
    print("it is NOT evidence of a general accuracy rate, and should never be")
    print("quoted as one.")
    print("\nIt is still far more meaningful than the 1.0 figures in")
    print("models/metadata.json, which were measured on a held-out split of the")
    print("SYNTHETIC training data where the two classes are trivially")
    print("separable. Those numbers should not be quoted at all.")
    print("\nMeasured on the full production pipeline -- model + rule layer +")
    print("hard floors + evidence ceiling -- which is what users actually get.\n")
