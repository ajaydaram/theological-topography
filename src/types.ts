export interface CreedProof {
  verseId: string;
  display: string;
}

export type CreedDocumentType =
  | 'ecumenical-creed'
  | 'confession'
  | 'catechism'
  | 'declaration'
  | 'article'
  | 'canon'
  | 'other';

export type DatePrecision = 'year' | 'year-range' | 'circa' | 'century-range' | 'unknown';
export type DateConfidence = 'high' | 'medium' | 'low';

export interface HistoricalDate {
  label: string;
  startYear?: number;
  endYear?: number;
  precision: DatePrecision;
  confidence: DateConfidence;
}

export interface HistoricalMetadata {
  type: CreedDocumentType;
  date: HistoricalDate;
}

export interface CreedDocument {
  id: string;
  title: string;
  content: string;
  year: number | string;
  proofs: CreedProof[];
  connections: string[]; // Related topics (Cross-Reference Engine)
  history_link: string | null; // Older creed it evolved from (Chain of Custody)
  topics?: string[];
  sourcePath?: string;
  historical?: HistoricalMetadata;
}

export interface VerseIndexEntry {
  verse: string;
  referencedBy: string[];
}

