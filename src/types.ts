export interface CreedProof {
  verseId: string;
  display: string;
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
}

export interface VerseIndexEntry {
  verse: string;
  referencedBy: string[];
}

