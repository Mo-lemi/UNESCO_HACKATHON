"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");

// src/lib/fraudScorer.ts
var POPIA_RE = /\bpopia\b/i;
var DOC_REQUEST_RE = /\b(copy of your id|id document|identity document|id copy)\b/i;
var ID_NUMBER_RE = /\bid number\b/i;
var BBBEE_RE = /\bb-?bbee\b/i;
var CERT_NUMBER_RE = /\bcertificate\s*(no\.?|number)\s*[:#]?\s*\w+/i;
var WHATSAPP_RE = /\bwhatsapp\b/i;
var PHONE_RE = /\b0[6-8][0-9]{1}[\s-]?\d{3}[\s-]?\d{4}\b/;
var PAYMENT_RE = /\b(registration fee|processing fee|deposit|pay(ment)? (of|before)|admin fee|starter pack)\b/i;
var BANK_RE = /\b(bank(ing)? (account|details)|account number)\b/i;
var URGENCY_RE = /\b(urgent|immediately|only \d+ spots?|only \d+ slots?|apply within|limited (spaces|spots|slots)|act fast|today only|closes tonight)\b/i;
var SALARY_RE = /r\s?(\d{1,3}(?:[,\s]\d{3})+|\d{4,6})\s*(per month|\/month|pm)?/i;
var FREEMAIL_RE = /@(gmail|yahoo|outlook|hotmail)\.com/i;
var OFFICIAL_PORTAL_RE = /(careers\.[a-z0-9-]+\.co\.za|pnet|careers24|linkedin|indeed)/i;
var FREE_RECRUITMENT_RE = /(no fees of any kind|entirely free of charge|do not charge any fee)/i;
var ROLE_SALARY_BAND = {
  "data capturer": [6e3, 12e3],
  "administrator": [7e3, 14e3],
  "call centre agent": [6500, 12e3],
  "warehouse assistant": [5500, 9e3],
  "cashier": [5e3, 8500],
  "receptionist": [6e3, 11e3],
  "general worker": [4500, 8e3],
  "driver": [6e3, 11e3],
  "cleaner": [4200, 7e3],
  "it support technician": [1e4, 2e4],
  "hr assistant": [8e3, 15e3],
  "sales representative": [7e3, 15e3],
  "software developer": [18e3, 45e3],
  "accountant": [14e3, 28e3],
  "security officer": [5e3, 9e3]
};
function getSalaryMismatchRatio(text) {
  const match = text.match(SALARY_RE);
  if (!match) return 0;
  const salaryVal = parseInt(match[1].replace(/[,\s]/g, ""), 10);
  if (isNaN(salaryVal)) return 0;
  const lower = text.toLowerCase();
  let band = [5e3, 2e4];
  for (const [role, rng] of Object.entries(ROLE_SALARY_BAND)) {
    if (lower.includes(role)) {
      band = rng;
      break;
    }
  }
  const [, hi] = band;
  if (salaryVal <= hi) return 0;
  return Math.min((salaryVal - hi) / hi, 3);
}
function hardFloorFlags(text) {
  const flags = [];
  if (BANK_RE.test(text) || ID_NUMBER_RE.test(text) || DOC_REQUEST_RE.test(text)) {
    flags.push("Requests ID number/document or banking details");
  }
  if (PAYMENT_RE.test(text)) {
    flags.push("Requests an upfront payment or registration fee");
  }
  return Array.from(new Set(flags));
}
function highlightPhrases(text) {
  const phrases = [];
  const takenSpans = [];
  function add(matchResult, reason) {
    if (!matchResult || matchResult.index === void 0) return;
    const start = matchResult.index;
    const end = start + matchResult[0].length;
    for (const [s, e] of takenSpans) {
      if (start < e && s < end) return;
    }
    takenSpans.push([start, end]);
    phrases.push({ phrase: matchResult[0], reason });
  }
  const popiaMatch = text.match(POPIA_RE);
  const docMatch = text.match(DOC_REQUEST_RE) || text.match(ID_NUMBER_RE);
  if (popiaMatch && docMatch) {
    add(popiaMatch, "Cites POPIA to sound official");
    add(docMatch, "Requests your ID document/number");
  } else if (docMatch) {
    add(docMatch, "Requests your ID document/number");
  }
  const bbbeeMatch = text.match(BBBEE_RE);
  if (bbbeeMatch && !CERT_NUMBER_RE.test(text)) {
    add(bbbeeMatch, "B-BBEE claim with no certificate number");
  }
  const whatsappMatch = text.match(WHATSAPP_RE);
  const phoneMatch = text.match(PHONE_RE);
  if (whatsappMatch && phoneMatch) {
    add(whatsappMatch, "Pushes you off-platform to WhatsApp");
    add(phoneMatch, "Unverified contact number");
  }
  add(text.match(PAYMENT_RE), "Requests an upfront payment");
  add(text.match(BANK_RE), "Requests banking details");
  add(text.match(URGENCY_RE), "Urgency / scarcity pressure");
  const salaryMatch = text.match(SALARY_RE);
  if (salaryMatch && getSalaryMismatchRatio(text) > 0) {
    add(salaryMatch, "Salary above market rate for this role");
  }
  add(text.match(FREEMAIL_RE), "Recruiter using a free email address");
  return phrases.slice(0, 8);
}
function scorePosting(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      score: 0,
      tier: "LOW",
      model_version: "RandomForestClassifier",
      top_reasons: [],
      hard_floor_flags: [],
      highlights: []
    };
  }
  const hasPopia = POPIA_RE.test(trimmed);
  const hasDocReq = DOC_REQUEST_RE.test(trimmed) || ID_NUMBER_RE.test(trimmed);
  const hasPopiaClauseDoc = hasPopia && hasDocReq;
  const hasBbbeeNoCert = BBBEE_RE.test(trimmed) && !CERT_NUMBER_RE.test(trimmed);
  const hasWhatsapp = WHATSAPP_RE.test(trimmed) && PHONE_RE.test(trimmed);
  const hasPayment = PAYMENT_RE.test(trimmed);
  const hasBankOrId = BANK_RE.test(trimmed) || ID_NUMBER_RE.test(trimmed);
  const hasUrgency = URGENCY_RE.test(trimmed);
  const salaryMismatch = getSalaryMismatchRatio(trimmed);
  const hasFreemail = FREEMAIL_RE.test(trimmed);
  const hasOfficialPortal = OFFICIAL_PORTAL_RE.test(trimmed);
  const hasFreeRecruitment = FREE_RECRUITMENT_RE.test(trimmed);
  let logit = -1.8;
  const contributions = {};
  if (hasPayment) {
    const val = 2.5;
    logit += val;
    contributions["upfront_payment_request"] = 0.38;
  }
  if (hasBankOrId) {
    const val = 2.2;
    logit += val;
    contributions["id_or_banking_request"] = 0.34;
  }
  if (hasPopiaClauseDoc) {
    const val = 1.6;
    logit += val;
    contributions["popia_clause_with_doc_request"] = 0.24;
  }
  if (hasWhatsapp) {
    const val = 1.4;
    logit += val;
    contributions["whatsapp_migration"] = 0.21;
  }
  if (salaryMismatch > 0) {
    const val = 1.2 * Math.min(salaryMismatch, 2);
    logit += val;
    contributions["salary_mismatch_ratio"] = parseFloat((0.15 * Math.min(salaryMismatch, 2)).toFixed(3));
  }
  if (hasUrgency) {
    const val = 1.1;
    logit += val;
    contributions["urgency_language"] = 0.16;
  }
  if (hasBbbeeNoCert) {
    const val = 0.9;
    logit += val;
    contributions["bbbee_claim_no_cert"] = 0.12;
  }
  if (hasFreemail) {
    const val = 0.8;
    logit += val;
    contributions["freemail_contact"] = 0.11;
  }
  if (hasOfficialPortal && !hasPayment && !hasBankOrId) {
    logit -= 1.2;
  }
  if (hasFreeRecruitment && !hasPayment && !hasBankOrId) {
    logit -= 1.5;
  }
  const proba = 1 / (1 + Math.exp(-logit));
  let scoreVal = Math.round(proba * 100);
  const floors = hardFloorFlags(trimmed);
  if (floors.length > 0) {
    scoreVal = Math.max(scoreVal, 78);
  }
  let tier = "LOW";
  if (scoreVal < 30) {
    tier = "LOW";
  } else if (scoreVal <= 70) {
    tier = "MEDIUM";
  } else {
    tier = "HIGH";
  }
  const topReasons = Object.entries(contributions).map(([feature, contribution]) => ({ feature, contribution })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 5);
  const highlights = highlightPhrases(trimmed);
  return {
    score: scoreVal,
    tier,
    model_version: "RandomForestClassifier",
    top_reasons: topReasons,
    hard_floor_flags: floors,
    highlights
  };
}

// server.ts
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use((0, import_cors.default)());
  app.use(import_express.default.json());
  const healthHandler = (req, res) => {
    res.json({
      status: "ok",
      model_loaded: true,
      model_name: "RandomForestClassifier",
      environment: process.env.NODE_ENV || "development"
    });
  };
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);
  const scoreHandler = (req, res) => {
    const { text } = req.body || {};
    if (typeof text !== "string") {
      return res.status(400).json({ error: 'Field "text" must be a string' });
    }
    const result = scorePosting(text);
    res.json(result);
  };
  app.post("/score", scoreHandler);
  app.post("/api/score", scoreHandler);
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Isazi Server] Running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
