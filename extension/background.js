// Qhaphela background service worker (Manifest V3).
// Calls the local FastAPI scoring endpoint (see ../qhaphela/app.py) and keeps a
// per-tab result so the popup can render instantly without re-scoring.

// All backend calls funnel through this service worker rather than being
// made directly from content.js, because the content script runs inside the
// job site's page context -- an HTTPS page can't call a local HTTP endpoint
// (mixed-content blocking), and routing through here also keeps the API
// origin out of the host page entirely.
const API_BASE = "http://127.0.0.1:8000";
const API_URL = `${API_BASE}/score`;

const TIER_COLORS = {
  HIGH: "#C1473A",
  MEDIUM: "#C9832E",
  LOW: "#2FA88B",
};

// companyName is optional -- when the content script can't find one on the
// page it sends "", and the backend skips the email-domain-vs-company check
// rather than guessing at a match.
async function scoreText(text, companyName = "") {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, company_name: companyName }),
  });
  if (!res.ok) throw new Error(`Qhaphela API error: ${res.status}`);
  return res.json();
}

// Community reporting (see ../qhaphela/reports.py). The store is local to
// this machine, so these counts are only ever presented in the UI as
// "recorded on this device", never as if other users had reported it.
async function submitReport(payload) {
  const res = await fetch(`${API_BASE}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Qhaphela report error: ${res.status}`);
  return res.json();
}

async function fetchReportStats(url, domain) {
  const qs = new URLSearchParams({ url: url || "", domain: domain || "" });
  const res = await fetch(`${API_BASE}/report-stats?${qs}`);
  if (!res.ok) throw new Error(`Qhaphela report-stats error: ${res.status}`);
  return res.json();
}

async function storeResultForTab(tabId, result, meta) {
  await chrome.storage.session.set({
    [`tab-${tabId}`]: { result, meta, scoredAt: Date.now() },
  });
}

function updateBadge(tabId, result) {
  const color = TIER_COLORS[result.tier] || "#565C66";
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeText({ tabId, text: String(result.score) });
}

// A badge colour change is easy to miss -- it's passive by design (Qhaphela
// never interrupts), but a HIGH verdict deserves an active nudge. Fires once
// per tab per posting, not on every re-scan the page's own MutationObserver
// debounce triggers, so re-rendering the same job detail panel (common on
// Indeed/LinkedIn split-view layouts) doesn't spam repeat notifications.
const notifiedTabs = new Set();

function maybeNotify(tabId, result, meta) {
  if (result.tier !== "HIGH") {
    notifiedTabs.delete(tabId);
    return;
  }
  if (notifiedTabs.has(tabId)) return;
  notifiedTabs.add(tabId);

  const topReason = (result.top_reasons || [])[0];
  const reasonText = topReason ? topReason.feature.replace(/_/g, " ") : "multiple red flags";
  chrome.notifications.create(`qhaphela-${tabId}-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: `Qhaphela: High risk (${result.score}/100)`,
    message: `${meta && meta.title ? meta.title : "This posting"} was flagged for ${reasonText}. Click the toolbar icon for the full reason.`,
    priority: 2,
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "QHAPHELA_SCAN") {
    const tabId = sender.tab && sender.tab.id;
    scoreText(message.text, message.company_name)
      .then((result) => {
        if (tabId != null) {
          const meta = { url: message.url, title: message.title };
          storeResultForTab(tabId, result, meta);
          updateBadge(tabId, result);
          maybeNotify(tabId, result, meta);
        }
        sendResponse({ ok: true, result });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // keep the message channel open for the async response
  }

  if (message.type === "QHAPHELA_SCAN_TEXT") {
    // Manual paste-to-scan from the popup -- no tab association needed.
    scoreText(message.text)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "QHAPHELA_GET_TAB_RESULT") {
    chrome.storage.session.get([`tab-${message.tabId}`]).then((data) => {
      sendResponse({ ok: true, data: data[`tab-${message.tabId}`] || null });
    });
    return true;
  }

  if (message.type === "QHAPHELA_REPORT") {
    submitReport({
      url: message.url,
      domain: message.domain,
      category: message.category,
      excerpt: message.excerpt,
      score: message.score,
    })
      .then((stats) => sendResponse({ ok: true, stats }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "QHAPHELA_OPEN_ANALYSIS") {
    // Opened as an extension page (not a content-script overlay) so the full
    // report has its own scroll, its own tabs, and can't be clipped by the
    // host site's layout.
    chrome.tabs.create({ url: chrome.runtime.getURL("analysis.html") });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "QHAPHELA_OPEN_ABOUT") {
    chrome.tabs.create({ url: chrome.runtime.getURL("about.html") });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "QHAPHELA_MATCH_FILE") {
    // Rebuilds the file from base64 (content scripts can't post multipart to
    // an http:// endpoint themselves) and forwards it to the local service.
    // Nothing is retained here.
    (async () => {
      try {
        const bin = atob(message.data_b64 || "");
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const form = new FormData();
        form.append("cv_file", new Blob([bytes]), message.filename || "cv");
        form.append("job_text", message.job_text || "");
        const res = await fetch(`${API_BASE}/match-file`, { method: "POST", body: form });
        const data = await res.json();
        sendResponse(res.ok ? { ok: true, match: data } : { ok: false, error: data.detail });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  if (message.type === "QHAPHELA_MATCH") {
    // CV text is forwarded for a single comparison and is never persisted
    // here or on the backend -- see the /match route in qhaphela/app.py.
    fetch(`${API_BASE}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cv_text: message.cv_text, job_text: message.job_text }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Qhaphela match error: ${res.status}`);
        return res.json();
      })
      .then((match) => sendResponse({ ok: true, match }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "QHAPHELA_REPORT_STATS") {
    fetchReportStats(message.url, message.domain)
      .then((stats) => sendResponse({ ok: true, stats }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`tab-${tabId}`);
  notifiedTabs.delete(tabId);
});
