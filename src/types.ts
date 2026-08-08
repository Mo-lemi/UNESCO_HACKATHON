export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Reason {
  feature: string;
  contribution: number;
}

export interface Highlight {
  phrase: string;
  reason: string;
}

/** Itemised, fixed-weight risk factor shown to users (see features.rule_points). */
export interface RuleReason {
  reason: string;
  points: number;
}

/** Observations about contact details in the posting -- NOT registry verification. */
export interface ContactChecks {
  positive: string[];
  warning: string[];
}

/** CV advice: `tailored` is derived from this posting's stated requirements. */
export interface CvGuidance {
  tailored: string[];
  general: string[];
}

export interface ScoreResponse {
  score: number;
  tier: RiskTier;
  model_version: string;
  /** Raw SHAP feature contributions. Kept for the API docs view; not shown
   *  to end users, since real testing showed these are often generic
   *  recruiting vocabulary that means nothing to a non-technical reader. */
  top_reasons: Reason[];
  hard_floor_flags: string[];
  highlights: Highlight[];
  rule_reasons: RuleReason[];
  rule_points_total: number;
  identity_theft_signals: string[];
  contact_checks: ContactChecks;
  cv_guidance: CvGuidance;
  
  /* === ADD THE MISSING PROPERTIES BELOW === */
  positive_signals: RuleReason[];
  ai_confidence: number;
}

export interface SamplePosting {
  id: string;
  title: string;
  category: 'scam' | 'legitimate';
  badgeLabel: string;
  description: string;
  text: string;
}

export interface Lesson {
  id: string;
  title: string;
  en: string;
  zu: string;
  af: string;
}

export type SupportedLanguage = 'en' | 'zu' | 'af';
