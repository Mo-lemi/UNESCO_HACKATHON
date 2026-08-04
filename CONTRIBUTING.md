# Contributing to Qhaphela

**Protecting Opportunities. Empowering Futures.**

Thank you for wanting to help protect job seekers.

## The one rule

**Qhaphela must never show a user something that is not true.**

A tool that protects people from deception loses all value the moment it
deceives them, even slightly, even to look more impressive.

In practice:

- Every number shown is computed at runtime. No mocked scores, no invented
  confidence, no placeholder statistics.
- Never claim verification that did not happen. We check contact details in
  the posting text; we do not check company registries, so we never say
  "verified".
- Never invent listings. "Safe alternatives" are only postings actually
  scanned and scored.
- Local counts are labelled local. There is no shared reporting network yet,
  so nothing may imply other users reported something.
- State limits plainly. A small evaluation sample is reported as a fraction
  with its caveat, not rounded up into a percentage that implies more.

If a feature can only look good by bending one of these, it does not ship.

## Especially welcome

- **Translation review.** The 11 official language strings were written
  without first-language review. Corrections are genuinely valuable - a safety
  warning that reads awkwardly undermines the trust it exists to build.
- **Real labelled postings** to strengthen evaluation (with any personal
  details removed first).
- **Detection gaps** - a real scam pattern that gets through.
- **False positives** - a genuine posting wrongly flagged. These matter as
  much as missed scams: wrongly flagging a small employer disrupts real hiring.

## Before opening a pull request

```bash
# Backend
source venv/bin/activate
pytest qhaphela/ -q
python qhaphela/evaluate.py

# Extension
for f in extension/*.js; do node --check "$f"; done
python3 -c "import json; json.load(open('extension/manifest.json'))"

# Web app
npx tsc --noEmit
```

Add a regression test for anything you fix. Every guard in this codebase
exists because something real went wrong once.

## Privacy

Never commit: `reports.db`, real CVs, real personal information, or documents
containing ID numbers. Check `git status` before committing.
