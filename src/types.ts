export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Reason {
  feature: string;
  contribution: number;
}

export interface Highlight {
  phrase: string;
  reason: string;
}

export interface ScoreResponse {
  score: number;
  tier: RiskTier;
  model_version: string;
  top_reasons: Reason[];
  hard_floor_flags: string[];
  highlights: Highlight[];
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
