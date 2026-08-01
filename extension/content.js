// Isazi content script.
// Grabs a best-effort chunk of the visible job posting text, hands it to the
// background service worker for scoring, then underlines the exact flagged
// phrases directly in the page -- the explanation lives in the posting
// itself, not only in the popup.

const HIGHLIGHT_CLASS = "isazi-flag";

function extractPosting() {
  const candidates = Array.from(
    document.querySelectorAll(
      [
        "article",
        "main",
        "[role='main']",
        ".job-description",
        "#jobDescriptionText",
        ".jobsearch-JobComponent-description",
        ".jobsearch-ViewJobLayout-jobDisplay",
        "[data-testid='jobsearch-JobComponent-description']",
      ].join(", ")
    )
  );
  let container = null;
  let best = "";
  for (const el of candidates) {
    const text = (el.innerText || "").trim();
    if (text.length > best.length) {
      best = text;
      container = el;
    }
  }
  if (best.length < 200) {
    best = (document.body.innerText || "").trim();
    container = document.body;
  }
  return { text: best.slice(0, 4000), container };
}

function ensureHighlightStyle() {
  if (document.getElementById("isazi-highlight-style")) return;
  const style = document.createElement("style");
  style.id = "isazi-highlight-style";
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      text-decoration: underline;
      text-decoration-color: #C1473A;
      text-decoration-thickness: 2px;
      text-underline-offset: 2px;
      background: rgba(193, 71, 58, 0.12);
      cursor: help;
    }
  `;
  document.documentElement.appendChild(style);
}

function clearHighlights(container) {
  if (!container) return;
  container.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
}

// Finds every remaining, not-yet-placed phrase inside one text node and
// replaces the node with a mix of plain text and highlighted spans in a
// single pass, so multiple flags in the same sentence all get marked
// instead of only the first one found.
function highlightWithinTextNode(textNode, highlights, usedPhrases) {
  const value = textNode.nodeValue;
  const lowerValue = value.toLowerCase();
  const matches = [];

  for (const item of highlights) {
    if (usedPhrases.has(item.phrase)) continue;
    const idx = lowerValue.indexOf(item.phrase.toLowerCase());
    if (idx === -1) continue;
    matches.push({ start: idx, end: idx + item.phrase.length, reason: item.reason, phrase: item.phrase });
  }
  if (matches.length === 0) return;

  matches.sort((a, b) => a.start - b.start);
  const clean = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start < lastEnd) continue; // drop overlapping matches
    clean.push(m);
    lastEnd = m.end;
  }

  const frag = document.createDocumentFragment();
  let cursor = 0;
  for (const m of clean) {
    if (m.start > cursor) frag.appendChild(document.createTextNode(value.slice(cursor, m.start)));
    const span = document.createElement("span");
    span.className = HIGHLIGHT_CLASS;
    span.title = `Isazi: ${m.reason}`;
    span.textContent = value.slice(m.start, m.end);
    frag.appendChild(span);
    usedPhrases.add(m.phrase);
    cursor = m.end;
  }
  if (cursor < value.length) frag.appendChild(document.createTextNode(value.slice(cursor)));

  textNode.parentNode.replaceChild(frag, textNode);
}

function applyHighlights(container, highlights) {
  if (!container || !highlights || highlights.length === 0) return;
  ensureHighlightStyle();
  clearHighlights(container);

  const usedPhrases = new Set();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && node.nodeValue.trim().length > 0) textNodes.push(node);
  }
  for (const textNode of textNodes) {
    if (usedPhrases.size === highlights.length) break;
    highlightWithinTextNode(textNode, highlights, usedPhrases);
  }
}

let lastScannedText = null;

function sendForScoring() {
  const { text, container } = extractPosting();
  if (!text || text.length < 60 || text === lastScannedText) return;
  lastScannedText = text;

  chrome.runtime.sendMessage(
    { type: "ISAZI_SCAN", url: location.href, title: document.title, text },
    (resp) => {
      if (resp && resp.ok && resp.result) {
        applyHighlights(container, resp.result.highlights || []);
      }
    }
  );
}

// Run once the page has settled, and again on SPA-style content swaps
// (Facebook/LinkedIn/Indeed re-render without a full navigation).
window.addEventListener("load", () => setTimeout(sendForScoring, 1200));
const observer = new MutationObserver(() => {
  clearTimeout(window.__isaziDebounce);
  window.__isaziDebounce = setTimeout(sendForScoring, 1500);
});
observer.observe(document.body, { childList: true, subtree: true });
