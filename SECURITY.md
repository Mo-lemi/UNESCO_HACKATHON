# Security Policy

**Protecting Opportunities. Empowering Futures.**

Qhaphela protects people from fraud, so a vulnerability here has real
consequences. Reports are taken seriously.

## Reporting a vulnerability

Please report privately first, via GitHub's **Report a vulnerability** button
on the Security tab, rather than opening a public issue.

Useful to include: what you found, how to reproduce it, and what an attacker
could achieve. A proof of concept helps but is not required.

You will get an acknowledgement within 7 days. Please allow a reasonable
period to fix before disclosing publicly.

## Scope

**In scope**
- The extension (content script, background worker, panel, report page)
- The local scoring service (`qhaphela/`)
- Anything that could leak a user's CV, browsing or reports off their machine
- Anything that could cause a scam to be scored as safe

**Out of scope**
- The job platforms Qhaphela runs on — report those to their owners
- Model accuracy on a given posting (open a normal issue instead)
- Findings that require an already-compromised machine

## Design constraints we hold to

These are deliberate, and breaking one is a security bug:

1. The CV is parsed in memory and never written to disk.
2. No page text leaves the browser unless the page is genuinely a job posting.
3. Report excerpts are stripped of ID numbers, phones, emails and account
   numbers before storage.
4. The scoring service accepts requests only from the extension and localhost.
5. No credentials or API keys exist, because no external service is called.

## Known limitations

Stated openly rather than discovered by a reader:

- The service runs over plain HTTP on `127.0.0.1`. Traffic does not leave the
  machine, but another local process could reach it. A hosted deployment would
  need TLS and authentication.
- The model was trained on synthetic data. Real-world evaluation is small and
  reported as such.
- Rate limiting is in-process, so it protects a single local instance only.
