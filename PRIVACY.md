# Qhaphela — Privacy Policy

**Protecting Opportunities. Empowering Futures.**

*Last updated: 4 August 2026*

This notice is issued in terms of **Section 18 of the Protection of Personal
Information Act 4 of 2013 (POPIA)** and meets the Chrome Web Store user data
disclosure requirements that took effect on 1 August 2026.

---

## 1. The short version

**Qhaphela does not collect your personal information.** No account, no login,
no analytics, no advertising, no tracking.

**Fraud detection runs entirely on your own computer.** The risk score, the red
flags, the phrase highlighting, the CV matching — all of it happens locally.
None of it is transmitted anywhere.

**One feature is different, and you should know exactly how.** *Qhaphela AI* —
the assistant, the chat, and the interview/cover-letter/CV tools — sends the
text you give it to **Groq** (`api.groq.com`) to be processed by the Llama 3.3
70B model. That text leaves your device. Nothing else does: no name, no
identifier, no browsing history, and no CV unless you attach one to an AI tool.

Everything except Qhaphela AI works with no internet connection at all.

---

## 2. Responsible party

| | |
|---|---|
| **Responsible party** | Sizwe Marole |
| **Capacity** | Student researcher, Department of Information Technology, Central University of Technology, Free State |
| **Contact** | Raise an issue at the project repository |
| **Purpose of processing** | Detecting fraudulent job advertisements to protect job seekers from recruitment fraud and identity theft |

This project accompanies postgraduate research: *"A Machine Learning Approach
for Detecting Fraudulent Job Postings to Fight Identity Theft Among South
African Job Seekers."*

---

## 3. What Qhaphela processes, and where

Qhaphela consists of a browser extension and a scoring service. **The scoring
service runs on your own computer** (`127.0.0.1`, localhost). It is not hosted
by us and is not reachable from the internet.

| Data | Why | Where it goes | Kept? |
|---|---|---|---|
| Text of the job posting you are viewing | To score it for fraud indicators | Your own computer only | No |
| Company name shown on the page | To check whether the recruiter's email domain matches | Your own computer only | No |
| Your CV, if you choose to upload one | To compare against the job's stated requirements | Your own computer only | **No — parsed in memory, never written to disk** |
| Your language and theme choice | To remember your preference | Your browser's local storage | Yes, until you clear it |
| Jobs you add to the tracker | So you can see where you applied | Your browser's local storage | Yes, until you delete them |
| Reports you submit | To build local threat intelligence | A file on your own computer | Yes, until you delete it |
| **Text you send to Qhaphela AI** | To generate an explanation, answer or draft | **Groq (`api.groq.com`), outside your device** | Not by us. See section 5a. |

**Qhaphela never collects:** your name, ID number, email address, phone number,
location, browsing history, IP address, or any identifier at all.

---

## 4. Where Qhaphela runs, and when it does nothing

The extension is loaded on all websites so that it can protect you on any job
board, including small South African sites we could not list in advance.

**It stays completely inactive unless the page is genuinely a job posting.**
A page qualifies only if it declares itself a job posting in its own metadata,
has a job-shaped web address, or contains several independent hiring phrases.

On every other page — news, social media, shopping, anything personal — the
extension adds nothing to the page and **reads nothing that is sent anywhere.**

It is switched off entirely on banking, tax and webmail sites.

---

## 5. Your CV

If you upload a CV:

- it is read **in your browser**, sent to the scoring service **on your own
  computer**, and parsed **in memory**
- it is **never written to disk**, never logged, and never transmitted off your
  machine
- the comparison is literal keyword matching, so you can see exactly why each
  term matched
- closing the page discards it

---

## 5a. Qhaphela AI, and what it sends

This is the only part of Qhaphela that transmits anything off your device, so
it is set out in full.

**What is sent**, only when you actively use an AI feature:

| You do this | What is sent to Groq |
|---|---|
| Ask a question or paste a message | Your question or pasted text |
| "Explain this posting" | The job advert text |
| Interview preparation | The job advert text |
| Cover letter / application email | The job advert text **and your CV text** |
| Improve my CV | Your CV text and the job advert text |

**What is never sent:** your name, ID number, contact details, IP address (beyond
the ordinary network connection), browsing history, saved reports, tracked
applications, or any identifier for you. Requests carry no user account, because
none exists.

**Who processes it:** Groq Inc. Their handling is governed by their own privacy
policy at <https://groq.com/privacy-policy/>. Qhaphela has no control over their
retention. If you are not comfortable with that, **simply do not use the AI
features** — every other part of Qhaphela continues to work fully offline.

**Please do not paste** your ID number, banking details, passwords or any
document you would not want processed by a third party. The assistant will never
ask you for these.

**The AI never decides your risk score.** Scoring is done by the model on your
own machine. The assistant explains that score; it cannot change it.

---

## 6. Reports you submit

When you report a suspicious posting, Qhaphela stores, in a file on your own
computer:

- a one-way **hash** of the page address (not the address itself)
- the website's domain
- the category you chose, from a fixed list
- a short excerpt of the posting
- the risk score at the time

**Before that excerpt is saved, identifiers are automatically stripped from
it:** South African ID numbers, phone numbers, email addresses and
account-length numbers are replaced with placeholders. Nothing about *you* is
recorded — no name, no identifier, no timestamp tied to you.

Report counts shown in the interface are labelled **"recorded on this device"**
because that is the truth. There is no shared reporting network.

---

## 7. Your rights under POPIA

You have the right to access, correct, delete and object to the processing of
your personal information, and to complain to the Information Regulator.

In practice, because everything stays on your machine, **you exercise these
rights directly:**

| Right | How |
|---|---|
| See everything stored | Open the extension's storage in your browser, and open `qhaphela/reports.db` |
| Delete your reports | Delete the file `qhaphela/reports.db` |
| Delete preferences and tracker | Use **Clear all my data** in the extension, or remove the extension |
| Stop all processing | Remove the extension, or close the scoring service |

Removing the extension removes everything it stored.

**Information Regulator (South Africa)**
complaints.IR@justice.gov.za · https://inforegulator.org.za

---

## 8. Sharing

Qhaphela **sells** your information to nobody, and shares it with nobody for
advertising, analytics or profiling. There are no analytics, no advertising
networks, and no data sales, now or planned.

There is exactly **one** third-party service, and it is the one described in
section 5a: **Groq**, which processes the text you choose to send to Qhaphela
AI. It receives that text and nothing else. Every other feature shares nothing
with anyone.

Links to job platforms and free learning resources are ordinary links. Once you
click one, that website's own privacy policy applies, not this one.

---

## 9. Security

- The scoring service accepts connections only from your own computer
- It accepts requests only from the extension and localhost
- Requests are rate-limited and size-limited
- The browser extension holds **no credentials of any kind**. The Groq API key
  used by Qhaphela AI exists only in a `.env` file on your own machine, is read
  by the local service alone, and is never sent to the extension or included in
  any response. Responses are additionally scrubbed of anything key-shaped
  before they are returned, and there is an automated test asserting this
- Text sent to Qhaphela AI is fenced and labelled as untrusted, so a fraudulent
  advert cannot instruct the assistant. The assistant can only ever **raise** a
  concern, never lower a risk score

---

## 10. Children

Qhaphela is intended for job seekers of working age. It is not directed at
children, and collects nothing from anyone.

---

## 11. Changes

Material changes to how data is handled will be recorded here with a new date,
and disclosed in the extension, as the Chrome Web Store requires.
