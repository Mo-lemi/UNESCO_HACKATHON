"""
Training pipeline for the Isazi fraud-risk classifier.

Follows the four objectives of the underlying research proposal in order:
  1. Localised linguistic features -> features.rule_features()
  2. Class-imbalance correction   -> SMOTE, applied to the training fold only
  3. Lightweight classifier comparison -> Logistic Regression / Random Forest / XGBoost
  4. Post-hoc explainability      -> SHAP TreeExplainer on the winning model

Run:
    source ../venv/bin/activate   # from isazi/
    python data/generate_dataset.py
    python train.py
"""

import json
import os

import joblib
import numpy as np
import pandas as pd
import shap
from imblearn.over_sampling import SMOTE
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from features import class1_shap_values, combine_features, rule_matrix, RULE_FEATURE_NAMES

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "data", "synthetic_postings.csv")
MODEL_DIR = os.path.join(HERE, "models")


def load_data():
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(
            f"{DATA_PATH} not found. Run `python data/generate_dataset.py` first."
        )
    df = pd.read_csv(DATA_PATH)
    return df["text"].tolist(), df["label"].to_numpy()


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)
    texts, y = load_data()

    X_train_text, X_test_text, y_train, y_test = train_test_split(
        texts, y, test_size=0.25, stratify=y, random_state=42
    )

    # Terms already captured as explicit, named rule-layer features (see
    # features.py) are excluded from the TF-IDF vocabulary. Otherwise their
    # signal splits between an opaque word token and its named rule feature,
    # diluting both below the SHAP top-N and weakening the one thing this
    # product's "why flagged" panel depends on: a human-readable reason.
    rule_covered_terms = {"popia", "bbbee", "bbee", "whatsapp", "id", "bank", "banking"}
    stop_words = list(ENGLISH_STOP_WORDS.union(rule_covered_terms))
    vectorizer = TfidfVectorizer(max_features=800, ngram_range=(1, 2), stop_words=stop_words)
    Xtr_tfidf = vectorizer.fit_transform(X_train_text)
    Xte_tfidf = vectorizer.transform(X_test_text)

    Xtr_rules = rule_matrix(X_train_text)
    Xte_rules = rule_matrix(X_test_text)

    Xtr = combine_features(Xtr_tfidf, Xtr_rules)
    Xte = combine_features(Xte_tfidf, Xte_rules)

    print(f"Train fraud rate before SMOTE: {y_train.mean():.3f}")
    smote = SMOTE(random_state=42)
    Xtr_res, y_train_res = smote.fit_resample(Xtr, y_train)
    print(f"Train fraud rate after SMOTE:  {y_train_res.mean():.3f}")

    candidates = {
        "logistic_regression": LogisticRegression(max_iter=1000, class_weight="balanced"),
        "random_forest": RandomForestClassifier(
            n_estimators=300, max_depth=None, random_state=42, n_jobs=-1
        ),
        "xgboost": XGBClassifier(
            n_estimators=300, max_depth=5, learning_rate=0.1,
            eval_metric="logloss", random_state=42, n_jobs=-1,
        ),
    }

    results = {}
    fitted = {}
    for name, clf in candidates.items():
        clf.fit(Xtr_res, y_train_res)
        proba = clf.predict_proba(Xte)[:, 1]
        preds = (proba >= 0.5).astype(int)
        report = classification_report(y_test, preds, output_dict=True, zero_division=0)
        auc = roc_auc_score(y_test, proba)
        results[name] = {
            "recall_fraud": report["1"]["recall"],
            "precision_fraud": report["1"]["precision"],
            "f1_fraud": report["1"]["f1-score"],
            "auc_roc": auc,
        }
        fitted[name] = clf
        print(f"\n== {name} ==")
        print(classification_report(y_test, preds, zero_division=0))
        print(f"AUC-ROC: {auc:.3f}")

    # Recall on the fraud class is the deciding metric -- a missed scam is
    # costlier than a false alarm, per the proposal's evaluation stance.
    # Ties are broken toward the tree-based models: they match the ~91%
    # Random Forest benchmark in Vidros et al. (2017) and, unlike logistic
    # regression, support the SHAP TreeExplainer this product's "why
    # flagged" panel depends on.
    tie_break_order = {"random_forest": 0, "xgboost": 1, "logistic_regression": 2}
    best_name = max(
        results,
        key=lambda n: (results[n]["recall_fraud"], -tie_break_order[n]),
    )
    best_model = fitted[best_name]
    print(f"\nSelected model: {best_name} (fraud recall={results[best_name]['recall_fraud']:.3f})")

    joblib.dump(vectorizer, os.path.join(MODEL_DIR, "vectorizer.joblib"))
    joblib.dump(best_model, os.path.join(MODEL_DIR, "model.joblib"))
    with open(os.path.join(MODEL_DIR, "metadata.json"), "w") as f:
        json.dump(
            {
                "model_name": best_name,
                "metrics": results,
                "rule_feature_names": RULE_FEATURE_NAMES,
                "tfidf_feature_count": len(vectorizer.get_feature_names_out()),
            },
            f,
            indent=2,
        )

    # SHAP explanation on the winning model, tree explainer only makes sense
    # for the tree-based candidates -- fall back gracefully for logistic
    # regression so the script never crashes regardless of which model wins.
    if best_name in ("random_forest", "xgboost"):
        explainer = shap.TreeExplainer(best_model)
        sample = Xte[:20]
        shap_values = explainer.shap_values(sample.toarray() if hasattr(sample, "toarray") else sample)
        sv = class1_shap_values(shap_values)
        mean_abs = np.abs(sv).mean(axis=0)
        feature_names = list(vectorizer.get_feature_names_out()) + RULE_FEATURE_NAMES
        top_idx = np.argsort(mean_abs)[::-1][:15]
        print("\nTop SHAP features (mean |contribution| over a 20-posting sample):")
        for idx in top_idx:
            print(f"  {feature_names[idx]:<35} {mean_abs[idx]:.4f}")
        joblib.dump(explainer, os.path.join(MODEL_DIR, "explainer.joblib"))
    else:
        print("\nSHAP TreeExplainer skipped (winning model is not tree-based).")

    print(f"\nSaved model artefacts to {MODEL_DIR}")


if __name__ == "__main__":
    main()
