import type { ManuscriptRef } from '../lib/ids';

export const PARSER_VERSION = '0.2.1';

export type PageType =
  | 'login'
  | 'main-menu'
  | 'role-center'
  | 'queue-list'
  | 'manuscript'
  | 'popup'
  | 'unknown';

/** One piece of evidence the classifier used. Logged so we can see why it decided. */
export interface Signal {
  pageType: PageType;
  name: string;
  weight: number;
  detail?: string;
}

export interface QueueCount {
  name: string;
  count: number;
}

export interface QueueRow extends ManuscriptRef {
  title?: string;
  status?: string;
  /** Raw cell values keyed by the normalized column header. */
  cells: Record<string, string>;
}

export interface Person {
  name: string;
  role?: string;
  status?: string;
  dates?: Record<string, string>;
}

export interface ManuscriptDetails extends ManuscriptRef {
  title?: string;
  status?: string;
  type?: string;
  submitted?: string;
  authors?: string;
  handlingEditor?: string;
  reviewers: Person[];
  /** Every "label: value" pair found on the page, normalized label → value. */
  fields: Record<string, string>;
}

export interface ParseResult {
  parserVersion: string;
  parsedAt: string;
  url: string;
  host: string;
  site: string | null;
  pageType: PageType;
  /** 0–1. Below 0.5 the result should be treated as a guess. */
  confidence: number;
  alternatives: Array<{ pageType: PageType; score: number }>;
  signals: Signal[];
  heading: string | null;
  /** The role center or queue this page belongs to, when we can tell. */
  context: string | null;
  /** Breadcrumb trail, when the page has one. */
  breadcrumb: string[];
  manuscriptIds: Array<ManuscriptRef & { count: number }>;
  manuscript?: ManuscriptDetails;
  queues?: QueueCount[];
  rows?: QueueRow[];
  /** Structural hash of the page (tags only, no text). Changes when ScholarOne changes the HTML. */
  fingerprint: string;
  /** Which strategy produced each extracted field, for debugging. */
  strategies: Record<string, string>;
  warnings: string[];
  elapsedMs: number;
}

export interface ParserConfig {
  idPattern?: string;
}
