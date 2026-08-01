// Isazi background service worker (Manifest V3).
// Calls the local FastAPI scoring endpoint (see ../isazi/app.py) and keeps a
// per-tab result so the popup can render instantly without re-scoring.

const API_URL = "http://127.0.0.1:8000/score";

const TIER_COLORS = {
  HIGH: "#C1473A",
  MEDIUM: "#C9832E",
  LOW: "#2FA88B",
};

async function scoreText(text) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Isazi API error: ${res.status}`);
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

// A badge colour change is easy to miss -- it's passive by design (Isazi
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
  chrome.notifications.create(`isazi-${tabId}-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: `Isazi: High risk (${result.score}/100)`,
    message: `${meta && meta.title ? meta.title : "This posting"} was flagged for ${reasonText}. Click the toolbar icon for the full reason.`,
    priority: 2,
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ISAZI_SCAN") {
    const tabId = sender.tab && sender.tab.id;
    scoreText(message.text)
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

  if (message.type === "ISAZI_SCAN_TEXT") {
    // Manual paste-to-scan from the popup -- no tab association needed.
    scoreText(message.text)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "ISAZI_GET_TAB_RESULT") {
    chrome.storage.session.get([`tab-${message.tabId}`]).then((data) => {
      sendResponse({ ok: true, data: data[`tab-${message.tabId}`] || null });
    });
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`tab-${tabId}`);
  notifiedTabs.delete(tabId);
});
