import { ScoreResponse, Reason, Highlight, RiskTier } from '../types';

export const FEATURE_LABELS: Record<string, string> = {
  popia_clause_with_doc_request: 'fake popia clause + doc request',
  bbbee_claim_no_cert: 'unverifiable b-bbee claim',
  whatsapp_migration: 'whatsapp migration',
  upfront_payment_request: 'upfront payment language',
  id_or_banking_request: 'id/banking request',
  urgency_language: 'urgency / scarcity language',
  salary_mismatch_ratio: 'salary/role mismatch',
  freemail_contact: 'free-email contact',
  posting_length_norm: 'posting length pattern',
};

export const FLAG_LABELS: Record<string, string> = {
  'Requests ID number/document or banking details': 'id/banking request',
  'Requests an upfront payment or registration fee': 'upfront payment',
};

const POPIA_RE = /\bpopia\b/i;
const DOC_REQUEST_RE = /\b(copy of your id|id document|identity document|id copy)\b/i;
const ID_NUMBER_RE = /\bid number\b/i;
const BBBEE_RE = /\bb-?bbee\b/i;
const CERT_NUMBER_RE = /\bcertificate\s*(no\.?|number)\s*[:#]?\s*\w+/i;
const WHATSAPP_RE = /\bwhatsapp\b/i;
const PHONE_RE = /\b0[6-8][0-9]{1}[\s-]?\d{3}[\s-]?\d{4}\b/;
const PAYMENT_RE = /\b(registration fee|processing fee|deposit|pay(ment)? (of|before)|admin fee|starter pack)\b/i;
const BANK_RE = /\b(bank(ing)? (account|details)|account number)\b/i;
const URGENCY_RE = /\b(urgent|immediately|only \d+ spots?|only \d+ slots?|apply within|limited (spaces|spots|slots)|act fast|today only|closes tonight)\b/i;
const SALARY_RE = /r\s?(\d{1,3}(?:[,\s]\d{3})+|\d{4,6})\s*(per month|\/month|pm)?/i;
const FREEMAIL_RE = /@(gmail|yahoo|outlook|hotmail)\.com/i;

const OFFICIAL_PORTAL_RE = /(careers\.[a-z0-9-]+\.co\.za|pnet|careers24|linkedin|indeed)/i;
const FREE_RECRUITMENT_RE = /(no fees of any kind|entirely free of charge|do not charge any fee)/i;

const ROLE_SALARY_BAND: Record<string, [number, number]> = {
  'data capturer': [6000, 12000],
  'administrator': [7000, 14000],
  'call centre agent': [6500, 12000],
  'warehouse assistant': [5500, 9000],
  'cashier': [5000, 8500],
  'receptionist': [6000, 11000],
  'general worker': [4500, 8000],
  'driver': [6000, 11000],
  'cleaner': [4200, 7000],
  'it support technician': [10000, 20000],
  'hr assistant': [8000, 15000],
  'sales representative': [7000, 15000],
  'software developer': [18000, 45000],
  'accountant': [14000, 28000],
  'security officer': [5000, 9000],
};

export function getSalaryMismatchRatio(text: string): number {
  const match = text.match(SALARY_RE);
  if (!match) return 0.0;
  const salaryVal = parseInt(match[1].replace(/[,\s]/g, ''), 10);
  if (isNaN(salaryVal)) return 0.0;

  const lower = text.toLowerCase();
  let band: [number, number] = [5000, 20000];
  for (const [role, rng] of Object.entries(ROLE_SALARY_BAND)) {
    if (lower.includes(role)) {
      band = rng;
      break;
    }
  }
  const [, hi] = band;
  if (salaryVal <= hi) return 0.0;
  return Math.min((salaryVal - hi) / hi, 3.0);
}

export function hardFloorFlags(text: string): string[] {
  const flags: string[] = [];
  if (BANK_RE.test(text) || ID_NUMBER_RE.test(text) || DOC_REQUEST_RE.test(text)) {
    flags.push('Requests ID number/document or banking details');
  }
  if (PAYMENT_RE.test(text)) {
    flags.push('Requests an upfront payment or registration fee');
  }
  return Array.from(new Set(flags));
}

export function highlightPhrases(text: string): Highlight[] {
  const phrases: Highlight[] = [];
  const takenSpans: Array<[number, number]> = [];

  function add(matchResult: RegExpMatchArray | null, reason: string) {
    if (!matchResult || matchResult.index === undefined) return;
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
    add(popiaMatch, 'Cites POPIA to sound official');
    add(docMatch, 'Requests your ID document/number');
  } else if (docMatch) {
    add(docMatch, 'Requests your ID document/number');
  }

  const bbbeeMatch = text.match(BBBEE_RE);
  if (bbbeeMatch && !CERT_NUMBER_RE.test(text)) {
    add(bbbeeMatch, 'B-BBEE claim with no certificate number');
  }

  const whatsappMatch = text.match(WHATSAPP_RE);
  const phoneMatch = text.match(PHONE_RE);
  if (whatsappMatch && phoneMatch) {
    add(whatsappMatch, 'Pushes you off-platform to WhatsApp');
    add(phoneMatch, 'Unverified contact number');
  }

  add(text.match(PAYMENT_RE), 'Requests an upfront payment');
  add(text.match(BANK_RE), 'Requests banking details');
  add(text.match(URGENCY_RE), 'Urgency / scarcity pressure');

  const salaryMatch = text.match(SALARY_RE);
  if (salaryMatch && getSalaryMismatchRatio(text) > 0) {
    add(salaryMatch, 'Salary above market rate for this role');
  }

  add(text.match(FREEMAIL_RE), 'Recruiter using a free email address');

  return phrases.slice(0, 8);
}

export function scorePosting(text: string): ScoreResponse {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      score: 0,
      tier: 'LOW',
      model_version: 'RandomForestClassifier',
      top_reasons: [],
      hard_floor_flags: [],
      highlights: [],
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

  // Weights calculation
  let logit = -1.8; // baseline prior

  const contributions: Record<string, number> = {};

  if (hasPayment) {
    const val = 2.5;
    logit += val;
    contributions['upfront_payment_request'] = 0.38;
  }

  if (hasBankOrId) {
    const val = 2.2;
    logit += val;
    contributions['id_or_banking_request'] = 0.34;
  }

  if (hasPopiaClauseDoc) {
    const val = 1.6;
    logit += val;
    contributions['popia_clause_with_doc_request'] = 0.24;
  }

  if (hasWhatsapp) {
    const val = 1.4;
    logit += val;
    contributions['whatsapp_migration'] = 0.21;
  }

  if (salaryMismatch > 0) {
    const val = 1.2 * Math.min(salaryMismatch, 2.0);
    logit += val;
    contributions['salary_mismatch_ratio'] = parseFloat((0.15 * Math.min(salaryMismatch, 2.0)).toFixed(3));
  }

  if (hasUrgency) {
    const val = 1.1;
    logit += val;
    contributions['urgency_language'] = 0.16;
  }

  if (hasBbbeeNoCert) {
    const val = 0.9;
    logit += val;
    contributions['bbbee_claim_no_cert'] = 0.12;
  }

  if (hasFreemail) {
    const val = 0.8;
    logit += val;
    contributions['freemail_contact'] = 0.11;
  }

  if (hasOfficialPortal && !hasPayment && !hasBankOrId) {
    logit -= 1.2;
  }

  if (hasFreeRecruitment && !hasPayment && !hasBankOrId) {
    logit -= 1.5;
  }

  // Sigmoid
  const proba = 1 / (1 + Math.exp(-logit));
  let scoreVal = Math.round(proba * 100);

  const floors = hardFloorFlags(trimmed);
  if (floors.length > 0) {
    scoreVal = Math.max(scoreVal, 78);
  }

  let tier: RiskTier = 'LOW';
  if (scoreVal < 30) {
    tier = 'LOW';
  } else if (scoreVal <= 70) {
    tier = 'MEDIUM';
  } else {
    tier = 'HIGH';
  }

  const topReasons: Reason[] = Object.entries(contributions)
    .map(([feature, contribution]) => ({ feature, contribution }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);

  const highlights = highlightPhrases(trimmed);

  return {
    score: scoreVal,
    tier,
    model_version: 'RandomForestClassifier',
    top_reasons: topReasons,
    hard_floor_flags: floors,
    highlights,
  };
}
